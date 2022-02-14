# GitHub Action: Syncronize pull_request to Redmine issue
pull_requestとRedmine issueを連携するGitHub Actionです。


# features
* 発行されたプルリクエストのブランチ名(HEAD ref)から、Redmineチケット番号を特定します。
* プルリクエストのステータス(opened, reopened, closed(merge), closed(unmerged))に応じてRedmineチケットのステータスを変更します。
* プルリクエストのステータスに応じて、Redmineチケットにコメントを追記します。
* Redmineチケットの説明欄にプルリクエストURLを挿入します。
* プルリクエストの説明欄にRedmineチケットURLを挿入します。



# ブランチ名
このアクションは、Redmineチケット番号をブランチ名から解析します。
したがって、プルリクエスト発行するブランチ名にはチケット番号を含める必要があります。

例えば

    feature@1234
    hotfix_1234
    develop/foo/1234
    
などです。

末尾である必要はありません。正規表現パターンで特定できるネーミングルールであればよいです。




