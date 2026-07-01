# Project Memory

## Code Change Flow

After code changes in this repository, use this flow unless the user says otherwise:

1. Run `npm run build`.
2. Stage the related source and generated `dist` changes.
3. Commit to Git with a concise message.
4. Push `master` to `origin`.
5. SSH to Tencent Cloud and pull the project:
   `ssh root@82.157.107.78 "cd /root/remoteControl && git pull"`.
6. Verify the local and server latest commits match.
