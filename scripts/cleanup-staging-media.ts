import { cleanupAbandonedStagingMedia } from "../lib/media-cleanup";

async function main() {
  const result = await cleanupAbandonedStagingMedia();
  console.log(JSON.stringify({ event: "media.staging_cleanup", ...result }));
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "media.staging_cleanup_failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
