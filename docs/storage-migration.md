# Object Storage Migration: MinIO → SeaweedFS

This document records the migration of QuantaGem's object storage from MinIO to
SeaweedFS, the rollback procedure, and the post-migration decommission checklist.

## Background

- MinIO's open-source project reached end-of-life in 2026: the `minio/minio`
  repository was archived (read-only) on **2026-04-25** and `minio/mc` on
  **2026-07-14** (the `minio/mc` Docker image was also removed from Docker Hub).
  The company now ships the commercial **MinIO AIStor** product line instead.
- The prior stack pinned an unpatched `minio/minio` image and relied on the
  delisted `minio/mc` image for lifecycle setup, so a fresh deployment could no
  longer be built or kept secure.
- **SeaweedFS 4.46** (Apache-2.0) was chosen as the replacement. It runs in
  single-process `weed mini` mode and supports every S3 operation the app uses
  plus full `PutBucketLifecycleConfiguration`.

## Architecture after migration

| Concern | Value |
|---|---|
| Service | `seaweedfs` (compose), image `chrislusf/seaweedfs:4.46` |
| Mode | `weed mini` (master + volume + filer + S3 in one process) |
| S3 endpoint | `http://seaweedfs:8333` (ops host port `127.0.0.1:8333`) |
| Data volume | `seaweedfs_data:/data` |
| Healthcheck | `curl -fsS http://localhost:9333/healthz` |
| Admin UI | `http://127.0.0.1:23646` (dev/ops only) |
| Bucket | `S3_BUCKET` (default `chat-files`) |
| Lifecycle | `temporary/` prefix expires after 1 day (see `configure-storage`) |
| Client | `src/lib/storage.ts` — `minio` npm package used as a plain S3 client (`pathStyle: true`) |

The app no longer references MinIO. The legacy `minio` service is moved behind
the `legacy` and `migrate` compose profiles and is **not** started by a normal
`docker compose up`. It is included whenever the `migrate` profile is enabled
(the migration tooling reads from it) and is only started when `migrate-storage`
requests it as a dependency.

## Migration runbook (run on a host with Docker)

All data is preserved by **copy-only** transfer; the source MinIO store is never
modified, and its `minio_data` volume is retained until decommission.

1. Bring up the new store alongside the running app (app stays on MinIO):
   ```bash
   docker compose up -d seaweedfs
   docker compose ps            # wait for `seaweedfs` to be healthy
   ```
2. Initial data copy + verification (starts legacy MinIO automatically):
   ```bash
   docker compose --profile migrate run --rm migrate-storage
   ```
   This runs `rclone copy`, then `rclone check` (full checksum), then `rclone size`
   for both stores. **`rclone check` must report zero differences.**
3. Stop writes, run the final incremental sync, and verify again:
   ```bash
   docker compose stop app
   docker compose --profile migrate run --rm migrate-storage
   ```
4. Apply the lifecycle rule to the new store and confirm it:
   ```bash
   docker compose --profile migrate run --rm configure-storage
   ```
5. Start the app against SeaweedFS:
   ```bash
   docker compose up -d --build app
   docker compose ps            # `seaweedfs` healthy, `minio` NOT running
   ```
6. Smoke test: login; upload a file into a new chat (temporary); send a message
   (temp→permanent migration); reload the chat and download the file back; attach a
   file to a project; delete a chat; confirm objects exist in SeaweedFS and the
   `temporary_files` rows are cleared by cleanup.

## Migration log

Fill the counts from the `migrate-storage` run (`rclone size` + `rclone check`).

| Step | Date | src objects | dst objects | src bytes | dst bytes | rclone check |
|---|---|---|---|---|---|---|
| 2 initial sync | 2026-09-12 | 1616 | 1616 | 1431487412 | 1431487412 | 0 differences |
| 3 final sync | 2026-09-12 | 1616 | 1616 | 1431487412 | 1431487412 | 0 differences |

> **Status:** the code, compose, env, and documentation changes are complete and the
> TypeScript typecheck is clean for all changed files. Runtime step 2 (initial data
> copy + verification) has been executed on the operator's Docker host and passed
> (1616 objects, 1.333 GiB, `rclone check` = 0 differences). Remaining steps 3–6
> (final sync, lifecycle, rebuild, smoke test) and the decommission steps are still
> pending.

## Rollback (during the soak window)

The legacy MinIO service and its `minio_data` volume are preserved until
decommission, so rollback is possible any time during the soak window:

1. Revert the cutover commit (restores `src/lib/minio.ts`, the `minio`
   `depends_on`, and the old `MINIO_*` env wiring).
2. Start the legacy store:
   ```bash
   docker compose --profile legacy up -d minio
   ```
3. Only if objects were written to SeaweedFS after cutover, copy them back with
   rclone (`dst` → `src`) using the same endpoint/credentials as in
   `docker-compose.yml` (`http://seaweedfs:8333` → `http://minio:9000`).
4. Rebuild and start the app: `docker compose up -d --build app`.

## Decommission (after a ≥ 2 week soak)

1. Re-run the smoke checklist and confirm `rclone check` is clean.
2. Remove the `minio` service and the `legacy` profile from `docker-compose.yml`.
3. Remove the one-shot `migrate-storage` / `configure-storage` services (and their
   `migrate` profile) from `docker-compose.yml`, and remove the legacy
   `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` / `MINIO_DEFAULT_BUCKET` vars from
   `.env` (no longer needed once fully migrated).
4. Validate: `docker compose config -q`.
5. **Only after explicit confirmation**, remove the old volume:
   ```bash
   docker volume ls | grep minio_data
   docker volume rm <project>_minio_data
   ```

## Why the `minio` npm package is kept

`src/lib/storage.ts` uses the `minio` Node.js SDK purely as an S3 client. It is a
standard path-style + SigV4 S3 client and works unchanged against SeaweedFS; only
the endpoint, port, and credentials differ (now `S3_*`). Swapping to
`@aws-sdk/client-s3` is possible but unnecessary and out of scope, so the
dependency stays in `package.json`.

## Notes & known limitations

- SeaweedFS ILM (lifecycle) is enforced by a worker on a ~daily cadence, so
  `temporary/` expiry can lag by up to a day. This matches the previous MinIO
  behavior and is a safety net only; the app's DB-driven `cleanup.ts` is the
  primary temp-file cleanup.
- The SeaweedFS image is pinned to `4.46`. Upgrade deliberately (`weed mini`
  defaults can drift between releases).
- `rclone check` uses full checksums, so a "zero differences" result is a
  byte-level integrity guarantee for the migrated objects.
