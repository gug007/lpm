#!/bin/sh
owner=gug007
name=lpm
open="repo:$owner/$name is:issue is:open"

exec gh api graphql \
  -f owner="$owner" \
  -f name="$name" \
  -f open="$open" \
  -f fresh="$open -commenter:$owner -author:$owner" \
  -f query='
query($owner: String!, $name: String!, $open: String!, $fresh: String!) {
  repository(owner: $owner, name: $name) { nameWithOwner url owner { login } }
  open: search(type: ISSUE, query: $open, first: 100) {
    issueCount
    nodes {
      ... on Issue {
        number title url createdAt bodyText
        author { login avatarUrl(size: 64) }
        reactions { totalCount }
        labels(first: 6) { nodes { name color } }
        comments(last: 1) { totalCount nodes { createdAt bodyText author { login avatarUrl(size: 64) } } }
      }
    }
  }
  fresh: search(type: ISSUE, query: $fresh, first: 100) {
    nodes { ... on Issue { number } }
  }
}' \
  --jq '
.data.repository.owner.login as $me
| [.data.fresh.nodes[].number] as $fresh
| {
    repo: .data.repository.nameWithOwner,
    url: .data.repository.url,
    me: $me,
    total: .data.open.issueCount,
    issues: [.data.open.nodes[] | (.comments.nodes[0] // null) as $last | .number as $n | {
      number, title, url, createdAt,
      author: (.author.login // "ghost"),
      avatar: (.author.avatarUrl // ""),
      body: (.bodyText[0:280]),
      reactions: .reactions.totalCount,
      comments: .comments.totalCount,
      labels: [.labels.nodes[] | {name, color}],
      last: (if $last then {author: ($last.author.login // "ghost"), avatar: ($last.author.avatarUrl // ""), at: $last.createdAt, body: ($last.bodyText[0:280])} else null end),
      state: (if any($fresh[]; . == $n) then "new"
              elif $last != null and ($last.author.login // "") != $me then "theirs"
              else "mine" end)
    }]
  }'
