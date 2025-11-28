// face_auth.js

// ==========================================
// متغيرات النظام
// ==========================================
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
let userLat = "", userLng = "";
let bestDescriptor = null;
let lastNoseX = 0, lastNoseY = 0;
let faceCheckInterval = null;
let videoStream = null;

// تحميل الموديلات عند فتح الصفحة
Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
]).then(() => {
    console.log("Face Models Loaded");
}).catch(e => {
    console.error("Failed to load Face-API models:", e);
});

// ==========================================
// دالة الانتقال من إدخال الآيدي إلى الكاميرا
// ==========================================
function startFaceFlow() {
    const studentID = document.getElementById('uniID').value; 
    
    // يجب أن تكون دالة showError موجودة في ملف آخر أو index.html
    if (!studentID || studentID.length < 3) {
        showError("يرجى إدخال الكود الجامعي بشكل صحيح"); 
        return;
    }

    document.getElementById('screenDataEntry').style.display = 'none';
    document.getElementById('screenFaceAuth').style.display = 'block';
    // نبدأ بطلب الموقع أولاً
    requestLocation(); 
}

function requestLocation() {
    const locStatus = document.getElementById('locationStatus');
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLat = pos.coords.latitude;
                userLng = pos.coords.longitude;
                locStatus.innerHTML = '<i class="fa-solid fa-check"></i> تم تحديد الموقع بنجاح';
                locStatus.style.color = "#10b981";
                startCameraSystem();
            }, 
            (err) => {
                locStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> تعذر تحديد الموقع (يجب تفعيل GPS)';
                locStatus.style.color = "#ef4444";
                startCameraSystem(); // نتابع للكاميرا حتى لو فشل الموقع
            }, 
            { enableHighAccuracy: true }
        );
    } else {
        locStatus.innerHTML = 'المتصفح لا يدعم تحديد الموقع';
        startCameraSystem();
    }
}

async function startCameraSystem() {
    const videoEl = document.getElementById('videoElement');
    const statusText = document.getElementById('faceStatusText');

    try {
        // طلب صلاحية الكاميرا الأمامية
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoStream = stream;
        videoEl.srcObject = stream;
        statusText.innerText = "اثبت مكانك تماماً.. لا تتحرك";
        startFaceLogic();
    } catch (e) {
        alert("يرجى السماح بصلاحية الكاميرا للمتابعة");
        cancelFaceAuth();
    }
}

function startFaceLogic() {
    const videoEl = document.getElementById('videoElement');
    const camBorder = document.getElementById('camBorder');
    const statusText = document.getElementById('faceStatusText');
    const timerDisplay = document.getElementById('camTimerDisplay');
    
    let step = 0; 
    let count = 3;
    let counting = false;
    let timerInt = null;

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });

    faceCheckInterval = setInterval(async () => {
        if(videoEl.paused || videoEl.ended) return;

        const det = await faceapi.detectSingleFace(videoEl, options)
                          .withFaceLandmarks()
                          .withFaceDescriptor()
                          .withFaceExpressions();

        if (det) {
            const nose = det.landmarks.getNose()[0];
            const jaw = det.landmarks.getJawOutline();
            const ratio = Math.abs(nose.x - jaw[0].x) / Math.abs(nose.x - jaw[16].x);
            
            const moveDist = Math.sqrt(Math.pow(nose.x - lastNoseX, 2) + Math.pow(nose.y - lastNoseY, 2));
            lastNoseX = nose.x; lastNoseY = nose.y;

            const isStableFace = det.expressions.neutral > 0.8 || (det.expressions.happy < 0.1);
            const isNotMoving = moveDist < 5;

            // المرحلة 1: الثبات وأخذ البصمة
            if (step === 0) {
                if (ratio > 0.8 && ratio < 1.2 && isStableFace && isNotMoving) {
                    camBorder.className = "cam-box status-ok";
                    statusText.innerText = "ممتاز.. خليك ثابت";
                    statusText.style.color = "#10b981";

                    if (!counting) {
                        counting = true;
                        timerDisplay.style.display = "flex";
                        timerInt = setInterval(() => {
                            count--;
                            timerDisplay.innerText = count;
                            if (count <= 0) {
                                clearInterval(timerInt);
                                bestDescriptor = Array.from(det.descriptor);
                                step = 1;
                                timerDisplay.style.display = "none";
                                camBorder.className = "cam-box status-wait";
                                statusText.innerText = "⬅️ التفت لليسار قليلاً";
                                statusText.style.color = "#f59e0b";
                            }
                        }, 1000);
                    }
                } else {
                    if (counting) {
                        clearInterval(timerInt); counting = false; count = 3;
                        timerDisplay.innerText = "3";
                        timerDisplay.style.display = "none";
                    }
                    camBorder.className = "cam-box status-err";
                    if (!isNotMoving) statusText.innerText = "⚠️ لا تتحرك!";
                    else statusText.innerText = "👀 انظر للأمام مباشرة";
                    statusText.style.color = "#ef4444";
                }
            }
            // المرحلة 2: الالتفات لليسار (Liveness Check)
            else if (step === 1) {
                if (ratio < 0.6) {
                    camBorder.className = "cam-box status-ok";
                    statusText.innerText = "✅ تم التحقق بنجاح";
                    statusText.style.color = "#10b981";
                    
                    finishFaceAuth();
                }
            }
        } else {
            camBorder.className = "cam-box status-err";
            statusText.innerText = "⚠️ لم يتم العثور على وجه";
            statusText.style.color = "#ef4444";
        }
    }, 500);
}

function finishFaceAuth() {
    clearInterval(faceCheckInterval);
    if(videoStream) videoStream.getTracks().forEach(track => track.stop());

    const finalPayload = {
        id: document.getElementById('uniID').value, 
        attendanceCode: document.getElementById('attendanceCode').value,
        vector: bestDescriptor,
        lat: userLat,
        lng: userLng
    };
    
    // 🔔 (1) هنا يتم إرسال البيانات إلى السيرفر 🔔
    console.log("البيانات الجاهزة للإرسال:", finalPayload);

    // ثم الانتقال إلى الشاشة التالية
    document.getElementById('screenFaceAuth').style.display = 'none';
    document.getElementById('screenScanQR').style.display = 'block'; 
}

function cancelFaceAuth() {
    clearInterval(faceCheckInterval);
    if(videoStream) videoStream.getTracks().forEach(track => track.stop());
    
    document.getElementById('screenFaceAuth').style.display = 'none';
    document.getElementById('screenDataEntry').style.display = 'block';
}