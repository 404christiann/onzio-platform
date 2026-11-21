import { Upload } from "tus-js-client";
import type { HeroVideoUploadTicket } from "./hero-video-client";

export type TusUploadHandlers = {
  onProgress: (sent: number, total: number) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
};
export type TusUploadHandle = { abort: () => void };

/** Browser-to-Bunny resumable upload using the signed ticket from the server. */
export function startTusUpload(file: File, ticket: HeroVideoUploadTicket, handlers: TusUploadHandlers): TusUploadHandle {
  const upload = new Upload(file, {
    endpoint: ticket.endpoint,
    retryDelays: [0, 3000, 5000, 10000, 20000],
    headers: {
      AuthorizationSignature: ticket.signature,
      AuthorizationExpire: String(ticket.expire),
      VideoId: ticket.videoId,
      LibraryId: String(ticket.libraryId),
      EnabledResolutions: ticket.enabledResolutions,
    },
    metadata: { filetype: file.type, title: file.name },
    onProgress: (sent, total) => handlers.onProgress(sent, total),
    onSuccess: () => handlers.onSuccess(),
    onError: error => handlers.onError(error),
  });
  upload.start();
  return { abort: () => { void upload.abort(); } };
}
