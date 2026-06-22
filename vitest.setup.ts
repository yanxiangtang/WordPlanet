// jsdom doesn't implement URL.createObjectURL / revokeObjectURL or
// Blob.prototype.arrayBuffer, both of which the app uses to round-trip cached
// Blob bytes. Stub them once so every test file gets the same baseline.

if (typeof URL.createObjectURL !== "function") {
  let counter = 0;
  // Return a unique-ish stub so callers (or assertions) that compare URLs
  // across multiple object URLs see distinct strings.
  URL.createObjectURL = () => `blob:mock-${counter++}`;
}

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}

if (typeof Blob.prototype.arrayBuffer !== "function") {
  // Minimal polyfill using FileReader, which jsdom does ship.
  Blob.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
      reader.readAsArrayBuffer(this);
    });
  };
}
