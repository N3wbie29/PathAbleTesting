
const video = document.getElementById("camera");
const statusText = document.getElementById("status");
const startButton = document.getElementById("startCamera");

// State
let cvReady = false;
let processing = false;
let stream = null;
let animationId = null;

// Output canvas
const outputCanvas = document.createElement("canvas");
outputCanvas.id = "processedCanvas";
outputCanvas.style.width = "100%";
outputCanvas.style.display = "block";
outputCanvas.style.marginTop = "12px";
outputCanvas.style.borderRadius = "12px";

video.insertAdjacentElement("afterend", outputCanvas);

// Off-screen canvas for capturing video frames
const inputCanvas = document.createElement("canvas");
const inputContext = inputCanvas.getContext("2d");

// Wait for OpenCV to become usable
async function waitForOpenCV(timeout = 15000) {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        try {
            if (
                typeof cv !== "undefined" &&
                typeof cv.Mat === "function" &&
                typeof cv.imread === "function" &&
                typeof cv.cvtColor === "function" &&
                typeof cv.Canny === "function" &&
                typeof cv.imshow === "function"
            ) {
                const test = new cv.Mat(
                    1, 1, cv.CV_8UC1
                );
                test.delete();
                return true;
            }
        } catch (error) {
            // OpenCV runtime may still be initialising.
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
}

async function initialiseOpenCV() {
    statusText.textContent = "Loading OpenCV...";

    cvReady = await waitForOpenCV();

    if (cvReady) {
        statusText.textContent =
            "OpenCV ready. Press Start Camera.";
        startButton.disabled = false;
        console.log("OpenCV is ready.");
    } else {
        statusText.textContent =
            "OpenCV failed to initialise. Check Console.";
        console.error("Required OpenCV functions are unavailable.");
    }
}

// Process one frame
function processFrame() {
    if (!processing) return;

    let src = null;
    let gray = null;
    let edges = null;

    try {
        if (
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            video.videoWidth === 0 ||
            video.videoHeight === 0
        ) {
            animationId = requestAnimationFrame(processFrame);
            return;
        }

        const width = video.videoWidth;
        const height = video.videoHeight;

        // Keep the canvases aligned with the current video size.
        if (
            inputCanvas.width !== width ||
            inputCanvas.height !== height
        ) {
            inputCanvas.width = width;
            inputCanvas.height = height;
            outputCanvas.width = width;
            outputCanvas.height = height;
        }

        // Capture the current camera frame.
        inputContext.drawImage(
            video, 0, 0, width, height
        );

        // Convert canvas pixels to an OpenCV matrix.
        src = cv.imread(inputCanvas);

        // Convert colour image to grayscale.
        gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Detect edges.
        edges = new cv.Mat();
        cv.Canny(gray, edges, 80, 160);

        // Display the result.
        cv.imshow(outputCanvas, edges);

    } catch (error) {
        processing = false;
        statusText.textContent =
            "Image processing error: " + error.message;
        console.error("Processing error:", error);
        return;

    } finally {
        if (src) src.delete();
        if (gray) gray.delete();
        if (edges) edges.delete();
    }

    if (processing) {
        animationId = requestAnimationFrame(processFrame);
    }
}

// Start camera
startButton.addEventListener("click", async () => {
    startButton.disabled = true;

    try {
        if (!cvReady) {
            cvReady = await waitForOpenCV();
        }

        if (!cvReady) {
            throw new Error("OpenCV is not ready.");
        }

        processing = false;

        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        statusText.textContent = "Starting camera...";

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        // Wait for valid video dimensions.
        if (!video.videoWidth || !video.videoHeight) {
            await new Promise(resolve => {
                video.addEventListener(
                    "loadedmetadata",
                    resolve,
                    { once: true }
                );
            });
        }

        const width = video.videoWidth;
        const height = video.videoHeight;

        inputCanvas.width = width;
        inputCanvas.height = height;
        outputCanvas.width = width;
        outputCanvas.height = height;

        console.log("Camera dimensions:", width, height);

        processing = true;
        statusText.textContent =
            "PathAble is processing live camera frames.";

        processFrame();

    } catch (error) {
        processing = false;

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        video.srcObject = null;

        statusText.textContent = error.message;
        console.error(error);

    } finally {
        startButton.disabled = false;
    }
});

// Clean up camera resources when leaving the page
window.addEventListener("beforeunload", () => {
    processing = false;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
    }

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});

initialiseOpenCV();
