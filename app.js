
const video = document.getElementById("camera");
const canvas = document.getElementById("detectionCanvas");
const context = canvas.getContext("2d");

const statusText = document.getElementById("status");
const startButton = document.getElementById("startCamera");

let model = null;
let stream = null;
let running = false;
let detecting = false;
let animationId = null;
let lastDetectionTime = 0;

// Minimum confidence required to show a detection.
const CONFIDENCE_THRESHOLD = 0.45;

// Load the object detection model.
async function loadModel() {
    try {
        statusText.textContent =
            "Loading object detection model...";

        model = await cocoSsd.load();

        statusText.textContent =
            "Model ready. Press Start Camera.";

        startButton.disabled = false;

        console.log("COCO-SSD model loaded.");

    } catch (error) {
        statusText.textContent =
            "Model failed to load. Check your internet connection.";

        console.error("Model loading error:", error);
    }
}

// Prepare canvas dimensions after camera starts.
function resizeCanvas() {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
    }
}

// Draw bounding boxes and labels.
function drawDetections(predictions) {
    context.clearRect(
        0, 0, canvas.width, canvas.height
    );

    const visibleObjects = predictions.filter(
        item => item.score >= CONFIDENCE_THRESHOLD
    );

    for (const item of visibleObjects) {
        const [x, y, width, height] = item.bbox;

        // Draw the bounding box.
        context.strokeStyle = "#00e676";
        context.lineWidth = Math.max(
            3, canvas.width / 200
        );

        context.strokeRect(x, y, width, height);

        // Draw the object label and confidence.
        const label =
            item.class + " " +
            Math.round(item.score * 100) + "%";

        const fontSize = Math.max(
            16, canvas.width / 35
        );

        context.font = `bold ${fontSize}px Arial`;

        const labelHeight = fontSize + 10;
        const labelWidth =
            context.measureText(label).width + 12;

        const labelY = Math.max(
            0, y - labelHeight
        );

        context.fillStyle = "#00e676";
        context.fillRect(
            x, labelY, labelWidth, labelHeight
        );

        context.fillStyle = "#102020";
        context.fillText(
            label, x + 6, labelY + fontSize
        );
    }

    if (visibleObjects.length > 0) {
        const names = [
            ...new Set(
                visibleObjects.map(item => item.class)
            )
        ];

        statusText.textContent =
            "Detected: " + names.join(", ");
    } else {
        statusText.textContent =
            "Scanning surroundings...";
    }
}

// Process camera frames continuously.
async function detectionLoop(timestamp) {
    if (!running) return;

    animationId = requestAnimationFrame(detectionLoop);

    // Avoid running overlapping detections.
    // Aim for no more than about 4 detections per second.
    if (
        detecting ||
        timestamp - lastDetectionTime < 250 ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
        return;
    }

    detecting = true;
    lastDetectionTime = timestamp;

    try {
        const predictions = await model.detect(video);

        if (running) {
            drawDetections(predictions);
        }

    } catch (error) {
        console.error("Detection error:", error);

        statusText.textContent =
            "Detection error: " + error.message;

    } finally {
        detecting = false;
    }
}

// Start the camera and detection.
startButton.addEventListener("click", async () => {
    if (!model || running) return;

    startButton.disabled = true;
    statusText.textContent = "Starting camera...";

    try {
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

        if (!video.videoWidth || !video.videoHeight) {
            await new Promise(resolve => {
                video.addEventListener(
                    "loadedmetadata",
                    resolve,
                    { once: true }
                );
            });
        }

        resizeCanvas();

        running = true;
        lastDetectionTime = 0;

        statusText.textContent =
            "Camera started. Detecting objects...";

        startButton.textContent = "Camera Running";

        animationId = requestAnimationFrame(detectionLoop);

    } catch (error) {
        if (stream) {
            stream.getTracks().forEach(
                track => track.stop()
            );
            stream = null;
        }

        video.srcObject = null;

        statusText.textContent =
            "Camera error: " + error.message;

        console.error("Camera error:", error);

        startButton.disabled = false;
    }
});

// Release camera resources when leaving the page.
window.addEventListener("beforeunload", () => {
    running = false;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
    }

    if (stream) {
        stream.getTracks().forEach(
            track => track.stop()
        );
    }
});

// Load the model when the page opens.
loadModel();
