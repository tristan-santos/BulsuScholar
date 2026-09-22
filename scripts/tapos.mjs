import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const windowsGit = "C:\\Program Files\\Git\\cmd\\git.exe";
const git = process.platform === "win32" && existsSync(windowsGit) ? windowsGit : "git";

function run(args, stdio = "inherit") {
  const result = spawnSync(git, args, { stdio });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed with exit code ${result.status}`);
  }
}

const now = new Date();
const pad = (value) => String(value).padStart(2, "0");
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

run(["add", "-A"]);
const staged = spawnSync(git, ["diff", "--cached", "--quiet"], { stdio: "inherit" });
if (staged.error) throw staged.error;
if (staged.status === 0) {
  console.log("Nothing to commit. No push was attempted.");
} else if (staged.status === 1) {
  run(["commit", "-m", `Update ${timestamp}`]);
  run(["push"]);
} else {
  throw new Error(`git diff failed with exit code ${staged.status}`);
}
