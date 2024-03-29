const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

function main() {
    try {
        // console.log("Current Dir: " + process.cwd())

        const context = github.context;

        if (context.eventName !== "pull_request") {
            let e = Error(
                "This action was called from an unexpected event. " +
                'This action expects to be called from a "pull_request" event, ' +
                'but it is actually a "'+ context.eventName +'" event. '
            );
            e.name = 'EventTriggerError';
            throw e
        }
    
        // get token
        const token = core.getInput('gh-token');
        // get octokit object
        const octokit = github.getOctokit(token);

        // head_ref name
        const in_head_ref = process.env.GITHUB_HEAD_REF;
        // プルリクNo
        const pr_number = context.payload.number;
        // const pr_number = 8;
        // イベントアクション
        const pr_action = context.payload.action;
        // const pr_action = 'closed';
        // Repo owner
        const owner = context.repo.owner;
        // const owner = 'mana544';
        // Repo name
        const repo = context.repo.repo;
        // const repo = 'check_prbr';
        // serverUrl
        const server_url = context.serverUrl;
        // merged
        const ismerged = context.payload.pull_request.merged;

        // jobs.<job-id> の<job-id>部分
        // "workflow-job-id"
        const job_id = context.job;

        // プルリクURL
        const pr_url = server_url + '/' + owner + '/' + repo + '/pull/' + pr_number;
        // Redmine URL
        const rm_url = core.getInput('rm-host');
        // Redmine API Key
        const rm_key = core.getInput('rm-api-key');
        // プルリク置換マーカー
        const pr_marker = core.getInput('marker-pr-url-in-rm');
        // const pr_marker = "@INSERT_PR_URL@";
        // Redmineチケットマーカー
        const rm_marker = core.getInput('marker-rm-url-in-pr');
        // チケット番号抽出正規表現パターン
        const regex_pattern = core.getInput('issue-num-regexp-pattern');
        // プルリクイベント'opened'時のstatus_id
        const stsid_opened = core.getInput('sts-id-if-opened-pr');
        // プルリクイベント'reopened'時のstatus_id
        const stsid_reopened = core.getInput('sts-id-if-reopened-pr');
        // プルリクイベント'closed'(merge)時のstatus_id
        const stsid_mgclosed = core.getInput('sts-id-if-mergeclosed-pr');
        // プルリクイベント'closed'(unmerged)時のstatus_id
        const stsid_unmgclosed = core.getInput('sts-id-if-unmergeclosed-pr');
        // プルリクイベント'opened'時のコメント
        const cmt_opened = core.getInput('comment-if-opened-pr');
        // プルリクイベント'reopened'時のコメント
        const cmt_reopened = core.getInput('comment-if-reopened-pr');
        // プルリクイベント'closed'(merge)時のコメント
        const cmt_mgclosed = core.getInput('comment-if-mergeclosed-pr');
        // プルリクイベント'closed'(unmerged)時のコメント
        const cmt_unmgclosed = core.getInput('comment-if-unmergeclosed-pr');
        // opened のときの実開始日更新: true/false(default)
        const act_st_opened = str2tf(core.getInput('act-st-date-if-opened-pr'));
        // reopened のときの実開始日更新: true/false(default)
        const act_st_reopened = str2tf(core.getInput('act-st-date-if-reopened-pr'));
        // closed(merge) のときの実終了日更新: true/false(default)
        const act_ed_mgclosed = str2tf(core.getInput('act-end-date-if-mergeclosed-pr'));
        // closed(unmerge) のときの実終了日更新: true/false(default)
        const act_ed_unmgclosed = str2tf(core.getInput('act-end-date-if-unmergeclosed-pr'));

        // ブランチ名からチケット番号抽出
        const issue_num = pick_issue_num(in_head_ref, regex_pattern);
        console.log("Pick Redmine issue number: " + issue_num)


        ////////////////////////////
        // プルリクイベント 'opened'
        ////////////////////////////
        if (pr_action === 'opened') {
            console.log("Pull_request '" + pr_action + "' event...")

            // Redmineチケット説明欄を取得
            // @INSERT_PR_URL@ があったら、プルリクURLに差し替える
            console.log("Redmineチケット #" + issue_num + "の説明欄を取得します...")
            replaceRmDescription(rm_url, rm_key, issue_num, pr_marker, pr_url)
            .then((description) => {
                console.log("Redmineチケットの説明欄を取得しました")

                // opened のときの実開始日更新設定
                let act_date = 0;
                if (act_st_opened) {
                    act_date = 1;
                }
                // Redmine チケット更新
                // * ステータスを stsid_opened にする
                // * チケットにコメントする
                // * 置換した説明欄をアップデート
                console.log("Redmineチケット #" + issue_num + "を更新...")
                let comment = cmt_opened + "\n\n" + pr_url;
                updateRmIssue(rm_url, rm_key, issue_num,
                    comment, 
                    stsid_opened, act_date, 
                    description)
                .then((dat) => {
                    console.log("Redmineチケット更新しました")
                    // レスポンス返ってきたあとの処理
                    console.log("*** res ***")
                    console.log(dat);
                    console.log("*** res ***")
                })
                .catch((e) => {
                    // メソッドエラー時の処理
                    // レスポンスエラーもコッチ
                    console.error(e)
                    core.setFailed("updateRmIssueメソッド実行中にエラーが発生しました。");

                });
    
            })
            .catch((e) => {
                // メソッドエラー時の処理
                // レスポンスエラーもコッチ
                console.error(e)
                core.setFailed("replaceRmDescriptionメソッド実行中にエラーが発生しました。");

            })
            .then(() => {
                console.log("Post Function")
            });

            // pull_request descriptionに `INSERT_RM_URL` があったら、
            // RedmineチケットURLに差し替える
            console.log("プルリクエスト #" + pr_number + "のbodyを取得します...")
            octokit.rest.pulls.get({
                owner: owner,
                repo: repo,
                pull_number: pr_number
            })
            .then(res => {
                console.log("プルリクエストのbodyを取得しました")
                // console.log(JSON.stringify(res.data.body, null, 2));
                // "body": "## やったこと\r\n* あああ\r\n\r\n## Redmine ticket\r\n`INSERT_RM_URL`\r\n\r\n\r\n\r\n"

                // pull_request body 内のマーカーを置換
                const org_str = res.data.body;
                const url = new URL('issues/' + issue_num, rm_url);
                const new_str = org_str.replaceAll(rm_marker, url.href);
            
                // pull_request Body 更新
                console.log("プルリクエスト #" + pr_number + "を更新します...")
                octokit.rest.pulls.update({
                    owner: owner,
                    repo: repo,
                    pull_number: pr_number,
                    body: new_str
                });

            });
    
    

        ////////////////////////////
        // プルリクイベント 'reopened'
        ////////////////////////////
        } else if (pr_action === 'reopened') {
            console.log("Pull_request '" + pr_action + "' event...")

            // reopened のときの実開始日更新
            let act_date = 0;
            if (act_st_reopened) {
                act_date = 1;
            }
            // Redmine チケット更新
            // * ステータスを stsid_reopened にする
            // * チケットにコメントする
            console.log("Redmineチケット #" + issue_num + "を更新...")
            let comment = cmt_reopened + "\n\n" + pr_url;
            updateRmIssue(rm_url, rm_key, issue_num,
                comment, 
                stsid_reopened, act_date)
            .then((dat) => {
                console.log("Redmineチケット更新しました")
                // レスポンス返ってきたあとの処理
                console.log("*** res ***")
                console.log(dat);
                console.log("*** res ***")
            })
            .catch((e) => {
                // メソッドエラー時の処理
                // レスポンスエラーもコッチ
                console.error(e)
                core.setFailed("updateRmIssueメソッド実行中にエラーが発生しました。");

            });


        ////////////////////////////
        // プルリクイベント 'closed'
        ////////////////////////////
        } else if (pr_action === 'closed') {

            ////////////////
            // マージ true
            ////////////////
            if (ismerged) {
                console.log("Pull_request '" + pr_action + "'(merged) event...")

                // closed(merge) のときの実終了日更新
                let act_date = 0;
                if (act_ed_mgclosed) {
                    act_date = 2;
                }
                // Redmine チケット更新
                // * ステータスを stsid_mgclosed にする
                // * チケットにコメントする
                console.log("Redmineチケット #" + issue_num + "を更新...")
                let comment = cmt_mgclosed + "\n\n" + pr_url;
                updateRmIssue(rm_url, rm_key, issue_num,
                    comment, 
                    stsid_mgclosed, act_date)
                .then((dat) => {
                    console.log("Redmineチケット更新しました")
                    // レスポンス返ってきたあとの処理
                    console.log("*** res ***")
                    console.log(dat);
                    console.log("*** res ***")
                })
                .catch((e) => {
                    // メソッドエラー時の処理
                    // レスポンスエラーもコッチ
                    console.error(e)
                    core.setFailed("updateRmIssueメソッド実行中にエラーが発生しました。");

                });


            ////////////////
            // マージ false
            ////////////////
            } else {
                console.log("Pull_request '" + pr_action + "'(unmerged) event...")

                // closed(unmerge) のときの実終了日更新
                let act_date = 0;
                if (act_ed_unmgclosed) {
                    act_date = 2;
                }
                // Redmine チケット更新
                // * ステータスを stsid_unmgclosed にする
                // * チケットにコメントする
                console.log("Redmineチケット #" + issue_num + "を更新...")
                let comment = cmt_unmgclosed + "\n\n" + pr_url;
                updateRmIssue(rm_url, rm_key, issue_num,
                    comment, 
                    stsid_unmgclosed, act_date)
                .then((dat) => {
                    console.log("Redmineチケット更新しました")
                    // レスポンス返ってきたあとの処理
                    console.log("*** res ***")
                    console.log(dat);
                    console.log("*** res ***")
                })
                .catch((e) => {
                    // メソッドエラー時の処理
                    // レスポンスエラーもコッチ
                    console.error(e)
                    core.setFailed("updateRmIssueメソッド実行中にエラーが発生しました。");

                });
                
            }

        ////////////////////////////
        // プルリクイベント other
        ////////////////////////////
        } else {
            // エラーをスロー
            let e = Error(
                "プルリクイベント '" + pr_action + "' は、このアクションでは対象外です。"
            );
            e.name = 'PRActTriggerError';
            throw e
        }
            
    } catch (e) {

        console.log("Debug: エラーをキャッチしました。");
        // #4 check-behavior オプションの新設
        // チェック挙動
        const chk_beh = core.getInput('check-behavior');

        // 挙動を変える対象かどうかを判定(以下のエラーだったら対象)
        // * 'PickIssueNumError'
        // * 'EventTriggerError'
        // * 'PRActTriggerError'
        if (['PickIssueNumError', 'EventTriggerError', 'PRActTriggerError'].includes(e.name)) {
            console.log("Debug: 特定のエラーです。");

            //////////////////////////////////////
            // check-behavior オプション 'warning'
            //////////////////////////////////////
            if (chk_beh === 'warning') {
                console.log(e);
                core.warning(e.toString());

            //////////////////////////////////////
            // check-behavior オプション 'error'(Default)
            //////////////////////////////////////
            } else {
                console.error(e);
                core.setFailed(e.message);
            }

        // 挙動変更対象外のエラーは、エラー送出
        } else {
            console.error(e);
            core.setFailed(e.message);
        }
    }
}


async function replaceRmDescription(
    rm_url, rm_key, issue_num, substr, newsubstr) {
    /* Redmineチケットの説明欄を取得し、文字列置換たあとの結果(説明欄本文)を返します

    input
    -----
    rm_url:string
        RedmineホストURL

    rm_key:string
        Redmine API Key

    issue_num:any
        チケット番号

    substr:string
        置換対象の文字列

    newsubstr:string
        置換後の文字列

    output
    ------
    replaced_issue_description:string
        文字列置換された後のRedmineチケットの説明欄


    */
    const url = new URL('issues/'+issue_num+'.json', rm_url);
    console.log("GET/ " + url.href)

    const config = {
        headers: {
            'X-Redmine-API-Key': rm_key
        }
    };

    let res;
    // 404エラーの場合はエラー送出
    res = await axios.get(url.href, config);

    // 説明欄の中身を置換して返す
    const org_str = res.data.issue.description;
    const new_str = org_str.replaceAll(substr, newsubstr);
    return new_str;

}

async function updateRmIssue(
    rm_url, rm_key, issue_num,
    comment, status, act_date, description){
    /*
    * チケットにコメントを残す
    * ステータスの変更(要求があれば)
    * description更新(要求があれば)

    commnet:str

    status_id:int = undefined

    desctiption:str = undefined

    act_date = {0,1,2}
        実開始日/実終了日の更新をするか
        0: 更新しない
        1: 実開始日を今日の日付にする
        2: 実終了日を今日の日付にする
    */

    const url = new URL('issues/'+issue_num+'.json', rm_url);
    console.log("PUT/ "+url.href)

    // 実開始日/実終了日の更新設定
    let act_st_date = undefined;
    let act_ed_date = undefined;
    if (act_date === 1) {
        // 実開始日を今日の日付に設定
        const date = new Date();
        const y = date.getFullYear();
        const m = date.getMonth()+1;
        const d = date.getDate();
        act_st_date = y
            + "-" + ('00' + m).slice(-2)
            + "-" + ('00' + d).slice(-2);
        
    } else if (act_date === 2) {
        // 実終了日を今日の日付に設定
        const date = new Date();
        const y = date.getFullYear();
        const m = date.getMonth()+1;
        const d = date.getDate();
        act_ed_date = y
            + "-" + ('00' + m).slice(-2)
            + "-" + ('00' + d).slice(-2);
        
    }
    console.log("act_st_date = " + act_st_date)
    console.log("act_ed_date = " + act_ed_date)

    const data = {
        "issue":{
            "status_id" : status,
            "description" : description,
            "notes" : comment,
            "actual_start_date" : act_st_date,
            "actual_due_date" : act_ed_date
        }
    };
    const headers = {
        'Content-Type': 'application/json',
        'X-Redmine-API-Key': rm_key
    };
    const config = {
        headers: headers,
        timeout: 10000
    };

    // 404エラーの場合はエラー送出
    const res = await axios.put(url.href, data, config);
    return res;

}

function pick_issue_num(ref_name, pattern) {
    /*

    input
    -----
    ref_name:string
        ブランチ名
    pattern:string
        チケット番号抽出正規表現パターン

    output
    ------
    issue_num:num
        チケット番号

    */

    // 正規表現オブジェクトつくる
    let re = new RegExp(pattern, 'g');
    // マッチすればarrayで返ってくる
    // マッチしなかったらnullで返ってくる
    const a = ref_name.match(re);

    // null(マッチしなかった)
    if (!a) {
        let e = Error(
            "ブランチ名 '" + ref_name + 
            "' からチケット番号を抽出できませんでした。パターンマッチしませんでした"
        );
        e.name = 'PickIssueNumError';
        throw e

    // なんかしらマッチした
    } else {
        // マッチした個数がひとつ
        if (a.length === 1) {
            // マッチした文字列を数値変換
            const n = Number(a[0]);
            
            // マッチした文字列を数値にできない
            if (Number.isNaN(n)) {
                let e = Error(
                    "ブランチ名 '" + ref_name + 
                    "' からチケット番号を抽出できませんでした。" +
                    "マッチした文字列 '"+ a[0] + 
                    "' が数値変換できませんでした"
                );
                e.name = 'PickIssueNumError';
                throw e
                    
            } else {
                return n;
            }

        // マッチした個数が複数
        } else {
            let e = Error(
                "ブランチ名 '" + ref_name + 
                "' からチケット番号を抽出できませんでした。" + 
                "マッチした文字列が複数存在します"
            );
            e.name = 'PickIssueNumError';
            throw e

        }
    }

}

function str2tf(str) {
    /*
    true or false の文字列をbooleanに変換します。
    アルゴリズム的には、'true'以外の文字列だったらfalseを返します。

    input
    -----
    str : string
        'true' or 'false' の文字列。
        大文字小文字は区別しません。

    return
    ------
    tf : boolean
        strから変換したboolean値。

    */
    const str2 = str.toLowerCase();

    let tf = false;
    if (str2 === 'true') {
        tf = true;
    }
    return tf
}


main();

