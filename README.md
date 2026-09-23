# github-fixer-mcp# github-fixer-mcp

MCP server ส่วนตัวที่ใช้ GitHub Personal Access Token เขียนไฟล์/สร้าง repo
โดยตรง ไม่ผ่าน GitHub App connector ที่มีปัญหาสิทธิ์

## วิธี push ครั้งแรกผ่าน Termux

```bash
git clone https://github.com/<YOUR_USERNAME>/github-fixer-mcp.git
cd github-fixer-mcp
# คัดลอก package.json, index.js, .gitignore, README.md เข้ามาในโฟลเดอร์นี้
git add .
git commit -m "Initial github-fixer-mcp"
git push origin main
```

## Deploy บน Render

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable: `GITHUB_TOKEN` = personal access token ของคุณ
  (Contents: Read and write, Administration: Read and write)

## Endpoint

`POST https://<your-service>.onrender.com/mcp`

## Tools

- `ping` — เช็คว่า token ใช้ได้
- `github_create_repository` — สร้าง repo ใหม่
- `github_upsert_files` — สร้าง/แก้ไฟล์หลายไฟล์
- `github_get_file` — อ่านไฟล์
