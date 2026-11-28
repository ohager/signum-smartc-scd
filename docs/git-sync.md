# GitHub sync

SmartC Studio can keep a project in sync with a folder of a GitHub repo. You import a contract from GitHub, pull other people's changes, resolve conflicts, and commit and push your own, all from the project menu. Nothing runs outside your browser: Studio talks to `api.github.com` directly.

## One project, one contract

A Studio project is one contract. In a repo, each contract lives in its own folder, and that folder carries a small marker file, `.smartc-studio`. The marker is what makes a folder a Studio project.

```json
{ "format": 1 }
```

- `format` is the marker version. If a repo has a newer format than your Studio understands, Studio says "This repo needs a newer Studio." and does not touch it. Unknown keys in the marker are kept when Studio rewrites it.
- A repo can hold several markers, which means several projects (for example `contracts/token` and `contracts/vault`). When you import, you pick one.
- Markers may not be nested: a marker folder below another marker folder is refused.
- If one marker folder holds more than one `.smart.c`, only the first one (by path) is imported. The others are skipped and reported, and pull and push never touch them on GitHub.

## What is tracked

Below the marker folder, Studio syncs these files, as UTF-8 text only:

`.smart.c`, `.asm`, `.scenario.json`, `.labels.json`, `.inspect.json`, `.ts`, `.md`

Generated `.asm` files are tracked like any other file. Everything else is never downloaded or changed: a README outside the folder, `package.json`, `.github/`, images, binaries, and any file that is not valid UTF-8. Empty folders are not pushed.

## The GitHub token

Studio needs a fine-grained personal access token:

1. In GitHub, create a fine-grained token and give it access to the repos you want to sync.
2. Set the repository permission **Contents: read and write**.
3. Paste it into Studio when asked.

The token is stored in this browser's `localStorage` and is sent only to `api.github.com`. To change or forget it, open "GitHub token…" in the import dialog, or choose "Change token" when an error says GitHub rejected it. The AI assistant cannot see the token.

## Import

In the project list, choose "Import from GitHub", enter `owner/repo` (or a github.com URL) and a branch, and look the repo up. Studio lists the projects (marker folders) it finds, with how many files are tracked and skipped. Pick one and import it as a new project.

## Initialize a folder

If the repo has no marker yet, is empty, or has an existing folder that can still take a marker, choose a folder to initialize (the repo root works too). Studio asks you to confirm, then creates one commit on GitHub, "Initialize SmartC Studio project", that contains only the marker. If the folder already has an invalid marker, the commit overwrites it, after you confirm. A valid marker is left alone. Your token must be able to push to the repo.

## Link an existing project

For a project you started in Studio, choose "Link to GitHub…" in the project menu and pick a repo, a branch and a folder: an existing project folder, or a new one to initialize. Linking a folder without a marker initializes it first, so your first push is a second commit. Linking can also pull files in, and it shows what it wrote and skipped.

If a link-time conflict dialog is cancelled, the project stays linked but needs a pull to finish.

### Another contract in the same repo

To add a second contract to a repo that already holds one, say `contracts/a`, link the new project and choose "Initialize a new folder". You can type a folder that does not exist yet: Studio suggests a sibling of the first project folder, named after your project (project "B" gives `contracts/b`), and you can edit it or pick an existing folder without a marker instead. The folder must be a relative path, may not lie above or below another marker folder, and may not be, or sit below, a file on GitHub. Studio commits only `contracts/b/.smartc-studio` (GitHub creates the folder with it), and your first push adds B's files there; `contracts/a` is not touched. Import keeps to existing folders and offers "Initialize" whenever at least one existing folder can take a marker.

A status badge shows where you stand: in sync, local changes, remote ahead, or both. Studio checks GitHub when you open the project and when the window gets focus, at most every 30 seconds.

## Pull

"Pull" brings in what changed on GitHub.

- A file changed on only one side is taken silently.
- A file changed on both sides is a conflict. For each one, choose **Mine** or **Theirs**, with a diff of the two versions, then apply.
- Right after a pull, "Undo pull" restores your files and the previous link state. It is refused if you edited files since.

## Push

"Commit & Push…" lists your changes and asks for a commit message. The commit goes straight to the linked branch; there are no branches or pull requests in Studio.

- If the branch moved on GitHub since your last pull, push stops with "The branch moved on GitHub — pull first." Pull, resolve any conflicts, and push again.
- If a local file sits at a path where GitHub has a file Studio skips, push refuses and asks you to rename your file.

## The assistant

The AI assistant cannot pull, push or see the token; no assistant tool reaches sync. While an assistant round runs on a project, pull and push are disabled for it.

## Limits

- GitHub only. Other hosts may come later.
- No branches or pull requests in Studio; you work on the linked branch.
- Empty folders are not pushed.
- Very large repos whose tree GitHub truncates fail with a message.
- One project is one contract (see above).
