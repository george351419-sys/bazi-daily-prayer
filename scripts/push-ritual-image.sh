#!/usr/bin/env bash
set -euo pipefail
: "IMAGE_REPOSITORY:?Set IMAGE_REPOSITORY}"
: "IMAGE_TAG:?Set IMAGE_TAG}"
# Bound each network attempt. Already uploaded content-addressed layers can be
# reused on retry; never rebuild or rerun model work just to retry an upload.
for attempt in 1 2; do
 printf 'Pushing image, attempt %s/2 (maximum 8 minutes)\n' "$attempt"
 if timeout --signal=TERM --kill-after=10s 480s docker push "$IMAGE_TAG"; then
  digest=$(docker image inspect "$IMAGE_TAG" --format '{{json .RepoDigests}}' | node --input-type=module -e '
   let input="";for await(const part of process.stdin)input+=part;
   const prefix=process.env.IMAGE_REPOSITORY+"@";
   const ref=(JSON.parse(input)||[]).find(value=>value.startsWith(prefix));
   const digest=ref?.slice(prefix.length);
   if(!/^sha256:[a-f0-9]{64}$/.test(digest||""))throw Error("Uploaded manifest digest is missing");
   process.stdout.write(digest);')
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf 'digest=%s\n' "$digest" >> "$GITHUB_OUTPUT"; fi
  printf 'Uploaded image: %s@%s\n' "$IMAGE_TAG" "$digest"
  exit 0
 fi
 if [[ "$attempt" == 1 ]]; then sleep 10; fi
done
printf 'Image upload failed after two bounded attempts. Check registry/network logs; the validated image will be saved as a workflow artifact.\n' >&2
exit 1
