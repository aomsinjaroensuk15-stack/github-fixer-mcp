import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API = "https://api.github.com";

function authHeaders() {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN env var is not set on the server");
  }
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function gh(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || res.statusText;
    throw new Error(`GitHub API ${res.status}: ${msg}`);
  }
  return data;
}

async function getFileSha(owner, repo, path, ref) {
  try {
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const data = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${q}`);
    return Array.isArray(data) ? undefined : data.sha;
  } catch {
    return undefined;
  }
}

const server = new McpServer({
  name: "github-fixer-mcp",
  version: "1.0.0",
});

server.tool(
  "ping",
  "ทดสอบว่า server ทำงานและ token ใช้ได้",
  {},
  async () => {
    const me = await gh("/user");
    return { content: [{ type: "text", text: `OK — authenticated as ${me.login}` }] };
  }
);

server.tool(
  "github_create_repository",
  "สร้าง GitHub repository ใหม่ในบัญชีของเจ้าของ token",
  {
    name: z.string().describe("ชื่อ repo"),
    description: z.string().optional(),
    private: z.boolean().optional().default(true),
    auto_init: z.boolean().optional().default(false),
  },
  async ({ name, description, private: isPrivate, auto_init }) => {
    const data = await gh("/user/repos", {
      method: "POST",
      body: JSON.stringify({ name, description, private: isPrivate, auto_init }),
    });
    return {
      content: [
        { type: "text", text: `สร้าง repo สำเร็จ: ${data.full_name}\nURL: ${data.html_url}` },
      ],
    };
  }
);

server.tool(
  "github_upsert_files",
  "สร้างหรืออัปเดตไฟล์หลายไฟล์ใน repository (ทีละ commit ต่อไฟล์)",
  {
    owner: z.string(),
    repo: z.string(),
    branch: z.string().default("main"),
    message: z.string().describe("commit message"),
    files: z
      .array(
        z.object({
          path: z.string(),
          content: z.string().describe("เนื้อหาไฟล์แบบ plain text (ไม่ต้อง base64)"),
        })
      )
      .min(1),
  },
  async ({ owner, repo, branch, message, files }) => {
    const results = [];
    for (const f of files) {
      const sha = await getFileSha(owner, repo, f.path, branch);
      const body = {
        message: `${message} (${f.path})`,
        content: Buffer.from(f.content, "utf-8").toString("base64"),
        branch,
      };
      if (sha) body.sha = sha;
      const data = await gh(
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(f.path)}`,
        { method: "PUT", body: JSON.stringify(body) }
      );
      results.push(`${f.path} -> ${data.commit?.sha?.slice(0, 7) ?? "ok"}`);
    }
    return { content: [{ type: "text", text: `อัปเดตสำเร็จ:\n${results.join("\n")}` }] };
  }
);

server.tool(
  "github_get_file",
  "อ่านเนื้อหาไฟล์จาก repository",
  {
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    ref: z.string().optional(),
  },
  async ({ owner, repo, path, ref }) => {
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const data = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${q}`);
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content: [{ type: "text", text: content }] };
  }
);

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: err.message || "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/", (req, res) => {
  res.send("github-fixer-mcp is running. POST to /mcp");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`github-fixer-mcp listening on port ${PORT}`);
});
