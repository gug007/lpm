// bytesToBlobUrl copies into a fresh ArrayBuffer so Blob's BlobPart typing
// accepts the result regardless of the source buffer shape, then returns a
// blob: URL the caller is responsible for revoking.
export function bytesToBlobUrl(bytes: Uint8Array, mimeType: string): string {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

export function downloadBlob(bytes: Uint8Array, filename: string, mimeType: string) {
  const url = bytesToBlobUrl(bytes, mimeType);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// base64ToBytes decodes a standard (padded) base64 string into a Uint8Array.
// Used for bytes crossing the Wails bridge: Go's json.Marshal emits []byte
// as base64, so the Wails-generated Array<number> type is a lie.
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// bytesToBase64 is the inverse of base64ToBytes. String.fromCharCode has an
// argument cap on some engines, so chunk large inputs. `apply` accepts the
// typed array directly (array-like), so no extra copy per chunk.
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
}
