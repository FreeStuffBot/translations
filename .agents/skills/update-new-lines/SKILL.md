---
name: update-new-lines
description: Update new translation texts in en-US to other popular languages.
---

# Update New Lines Skill

1. When asked to translate new lines, first figure out which lines are new.
- Check if there are unstaged or uncomitted changes in `en-US` files.
- If not, check the last commit for changes in `en-US` files. If the last commit is older than 2 hours or there are no changes done to `en-US` files, consult the user.

2. After figuring out the new lines, find out if the `scripts/sync-translations.sh` script has already been run.
- Check if any of the other translation files already has the new language keys. If yes, then the script has already been run.
- If not run, run the script to update the other translation files with the new keys.

3. Go through the following list of languages and translate the new lines from `en-US` to each of them:
- `pt-BR`, `es-ES`, `de`, `sk`, `tr`, `ar-SY`, `lt`, `it`, `pl`
- If there are more than 30 new lines, ask the user if all of the target languages should be translated and if subagents should be used to translate them in parallel.

4. After translating commit the changes
- If the original en-US files were unstaged or uncommited, commit these changes first and using the default git user.
- Only after that commit the other translation files using the `scripts/commit.sh` script to author them as the LLM user.
