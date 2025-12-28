import { removeBackground } from "@imgly/background-removal";

self.onmessage = async (e) => {
    const { imageBlob, config } = e.data;
    try {
        const resultBlob = await removeBackground(imageBlob, config);
        self.postMessage({ success: true, blob: resultBlob });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};