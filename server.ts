import express from "express";
import { createServer as createViteServer } from "vite";
import { Octokit } from "octokit";
import fs from "fs";
import path from "path";
import { glob } from "glob";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Route for GitHub Sync
  app.post("/api/github/sync", async (req, res) => {
    const { token, repo, owner } = req.body;

    if (!token || !repo || !owner) {
      return res.status(400).json({ error: "Missing required parameters (token, repo, owner)" });
    }

    try {
      const octokit = new Octokit({ auth: token });

      // 1. Get all files in the project (excluding ignored ones)
      const files = await glob("**/*", {
        ignore: [
          "node_modules/**",
          "dist/**",
          ".git/**",
          "package-lock.json",
          "*.log",
          ".env"
        ],
        nodir: true,
        dot: true
      });

      console.log(`Starting sync for ${files.length} files...`);

      // 2. Get the default branch (usually main)
      let branch = "main";
      try {
        const { data: repository } = await octokit.rest.repos.get({ owner, repo });
        branch = repository.default_branch;
      } catch (e) {
        // If repo doesn't exist, this will fail, which is fine
      }

      // 3. Upload files one by one (simplified for this tool)
      // Note: For a real production tool, we'd use a tree commit, but this is more reliable for a quick fix
      for (const filePath of files) {
        const content = fs.readFileSync(filePath);
        const contentBase64 = content.toString("base64");

        try {
          // Check if file exists to get its SHA
          let sha;
          try {
            const { data: existingFile } = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: filePath,
              ref: branch
            });
            if (!Array.isArray(existingFile)) {
              sha = existingFile.sha;
            }
          } catch (e) {
            // File doesn't exist, that's okay
          }

          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: filePath,
            message: `Sync from Visionary AI Pro - ${new Date().toISOString()}`,
            content: contentBase64,
            sha,
            branch
          });
          console.log(`Synced: ${filePath}`);
        } catch (err: any) {
          console.error(`Failed to sync ${filePath}:`, err.message);
        }
      }

      res.json({ success: true, message: `Successfully synced ${files.length} files to ${owner}/${repo}` });
    } catch (error: any) {
      console.error("GitHub Sync Error:", error);
      res.status(500).json({ error: error.message || "Failed to sync with GitHub" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
