import { CodeBlock, Comment } from "@/components/config/code-block";

export default function CliSnippet() {
  return (
    <CodeBlock filename="Terminal">
      <Comment># start a project, then wait until its web server answers</Comment>
      {"\n"}lpm start shop-api
      {"\n"}lpm wait --port 3000
      {"\n\n"}
      <Comment># the last 50 lines from the api service</Comment>
      {"\n"}lpm logs api -n 50
      {"\n\n"}
      <Comment># which agents are working, and which are waiting on you</Comment>
      {"\n"}lpm status --json
      {"\n\n"}
      <Comment># three copies, each starting Claude Code on the same prompt</Comment>
      {"\n"}lpm duplicate -n 3 --command claude --prompt &quot;Rate-limit the login route&quot;
    </CodeBlock>
  );
}
