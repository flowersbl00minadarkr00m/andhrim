export class RequestBodyError extends Error {
  constructor(message: string, readonly status: 400 | 413 = 400) {
    super(message);
    this.name = "RequestBodyError";
  }
}

type RequestBodyLabels = {
  overflow: string;
  malformed: string;
};

const backupLabels: RequestBodyLabels = { overflow: "backup upload", malformed: "selected backup" };

export async function readLimitedJsonRequest(
  request: Request,
  maximumBytes: number,
  labels: RequestBodyLabels = backupLabels,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maximumBytes) {
    throw new RequestBodyError(`The ${labels.overflow} exceeds the ${maximumBytes}-byte limit.`, 413);
  }
  if (!request.body) throw new RequestBodyError("The request body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      throw new RequestBodyError(`The ${labels.overflow} exceeds the ${maximumBytes}-byte limit.`, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new RequestBodyError(`The ${labels.malformed} is malformed JSON.`);
  }
}
