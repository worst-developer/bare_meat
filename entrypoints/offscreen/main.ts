interface ClipboardReadRequest {
  type: 'CLIPBOARD_READ_REQUEST';
  baselineHash?: string;
  timeout: number;
}

interface ClipboardReadResponse {
  success: boolean;
  dataUrl?: string;
  hash?: string;
  mimeType?: string;
  error?: string;
}

console.log('[bare meat🧸🥩] Offscreen page initialized');

async function readClipboardImage(): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
  try {
    const clipboardItems = await navigator.clipboard.read();
    
    for (const item of clipboardItems) {
      const mimeType = item.types.includes('image/png')
        ? 'image/png'
        : item.types.includes('image/jpeg')
        ? 'image/jpeg'
        : item.types.includes('image/webp')
        ? 'image/webp'
        : null;

      if (mimeType) {
        const blob = await item.getType(mimeType);
        return { data: await blob.arrayBuffer(), mimeType };
      }
    }
    
    return null;
  } catch (error) {
    console.error('[bare meat🧸🥩] Failed to read clipboard:', error);
    return null;
  }
}

async function computeHash(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleClipboardRead(request: ClipboardReadRequest): Promise<ClipboardReadResponse> {
  try {
    console.log(`[bare meat🧸🥩] Reading clipboard image (baseline: ${request.baselineHash?.substring(0, 8) || 'none'})`);
    
    const image = await readClipboardImage();
    
    if (!image) {
      return {
        success: false,
        error: 'No clipboard image found',
      };
    }
    
    const hash = await computeHash(image.data);
    
    console.log(`[bare meat🧸🥩] Clipboard image received, hash: ${hash.substring(0, 8)}...`);
    
    if (request.baselineHash && hash === request.baselineHash) {
      return {
        success: false,
        error: 'Clipboard hash unchanged',
      };
    }
    
    return {
      success: true,
      dataUrl: arrayBufferToDataUrl(image.data, image.mimeType),
      hash,
      mimeType: image.mimeType,
    };
  } catch (error) {
    console.error('[bare meat🧸🥩] Clipboard read error:', error);
    return {
      success: false,
      error: String(error),
    };
  }
}

chrome.runtime.onMessage.addListener(
  (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: ClipboardReadResponse) => void) => {
    if (message.type === 'CLIPBOARD_READ_REQUEST') {
      const request = message as ClipboardReadRequest;
      
      const resultHandler = async () => {
        const response = await handleClipboardRead(request);
        sendResponse(response);
      };
      
      resultHandler().catch((error) => {
        console.error('[bare meat🧸🥩] Result handler error:', error);
        sendResponse({
          success: false,
          error: String(error),
        });
      });
      
      return true;
    }
    
    return false;
  }
);

console.log('[bare meat🧸🥩] Offscreen page ready for messages');

function arrayBufferToDataUrl(arrayBuffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
