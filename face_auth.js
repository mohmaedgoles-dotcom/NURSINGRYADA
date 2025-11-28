// ==========================================
// ⚙️ إعدادات النظام
// ==========================================

// 🔴 هام جداً: استبدل الرابط التالي برابط تطبيق الويب الخاص بك من Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyKFRtSui8dfelJxTDl8T5jV1EMESlvhPht2Qqb2VU6tKtr3TFM1oGCT5kK-bkX26ZKLA/exec"; 

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
let userLat = "", userLng = "";
let bestDescriptor = null;
let lastNoseX = 0, lastNoseY = 0;
let faceCheckInterval = null;
let videoStream = null;

// ==========================================
// 🚀 1. التحميل والتهيئة
// ==========================================

// تحميل موديلات الذكاء الاصطناعي عند فتح الصفحة
Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
]).then(() => {
    console.log("✅ Face Models Loaded Successfully");
}).catch(e => {
    console.error("❌ Failed to load Face-API models:", e);
    alert("فشل تحميل ملفات الذكاء الاصطناعي، يرجى تحديث الصفحة");
});

// ==========================================
// 🛡️ 2. دوال الحماية (بصمة الجهاز)
// ==========================================

// دالة لتوليد أو استرجاع مفتاح الجهاز الفريد
function getDeviceId() {
    let id = localStorage.getItem('student_device_id');
    if (!id) {
        // توليد مفتاح عشوائي وحفظه في المتصفح للأبد
        id = 'DEV-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
        localStorage.setItem('student_device_id', id);
    }
    return id;
}

// دالة إظهار الأخطاء
function showError(msg) {
    alert("⚠️ تنبيه: " + msg);
}

// ==========================================
// 🎬 3. تسلسل العمليات
// ==========================================

// الخطوة الأولى: التحقق من الإدخال وبدء الموقع
function startFaceFlow() {
    const studentID = document.getElementById('uniID').value; 
    
    if (!studentID || studentID.length < 3) {
        showError("يرجى إدخال الكود الجامعي بشكل صحيح"); 
        return;
    }

    // إخفاء شاشة الإدخال وإظهار شاشة الكاميرا
    document.getElementById('screenDataEntry').style.display = 'none';
    document.getElementById('screenFaceAuth').style.display = 'block';
    
    requestLocation(); 
}

// الخطوة الثانية: طلب الموقع الجغرافي
function requestLocation() {
    const locStatus = document.getElementById('locationStatus');
    locStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تحديد الموقع...';
    
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
                console.warn("Location Error:", err);
                locStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> تعذر تحديد الموقع (يجب تفعيل GPS)';
                locStatus.style.color = "#ef4444";
                // سنكمل العملية حتى لو فشل الموقع (يمكنك إيقافها هنا إذا كان الموقع إجبارياً)
                startCameraSystem(); 
            }, 
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        locStatus.innerHTML = 'المتصفح لا يدعم تحديد الموقع';
        startCameraSystem();
    }
}

// الخطوة الثالثة: تشغيل الكاميرا
async function startCameraSystem() {
    const videoEl = document.getElementById('videoElement');
    const statusText = document.getElementById('faceStatusText');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoStream = stream;
        videoEl.srcObject = stream;
        statusText.innerText = "اثبت مكانك تماماً.. لا تتحرك";
        // تشغيل المحرك الذكي
        startFaceLogic();
    } catch (e) {
        console.error(e);
        alert("يرجى السماح بصلاحية الكاميرا للمتابعة");
        cancelFaceAuth();
    }
}

// ==========================================
// 🧠 4. المنطق الذكي (Liveness Check)
// ==========================================

function startFaceLogic() {
    const videoEl = document.getElementById('videoElement');
    const camBorder = document.getElementById('camBorder');
    const statusText = document.getElementById('faceStatusText');
    const timerDisplay = document.getElementById('camTimerDisplay');
    
    let step = 0; // 0: ثبات، 1: التفات
    let count = 3;
    let counting = false;
    let timerInt = null;

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });

    faceCheckInterval = setInterval(async () => {
        if(videoEl.paused || videoEl.ended) return;

        // اكتشاف الوجه والنقاط والتعابير
        const det = await faceapi.detectSingleFace(videoEl, options)
                          .withFaceLandmarks()
                          .withFaceDescriptor()
                          .withFaceExpressions();

        if (det) {
            const nose = det.landmarks.getNose()[0];
            const jaw = det.landmarks.getJawOutline();
            // حساب نسبة دوران الوجه (لليمين أو اليسار)
            const ratio = Math.abs(nose.x - jaw[0].x) / Math.abs(nose.x - jaw[16].x);
            
            // حساب ثبات الحركة
            const moveDist = Math.sqrt(Math.pow(nose.x - lastNoseX, 2) + Math.pow(nose.y - lastNoseY, 2));
            lastNoseX = nose.x; lastNoseY = nose.y;

            const isStableFace = det.expressions.neutral > 0.8 || (det.expressions.happy < 0.1);
            const isNotMoving = moveDist < 5;

            // --- المرحلة 1: الثبات وأخذ البصمة ---
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
                                bestDescriptor = Array.from(det.descriptor); // حفظ بصمة الوجه
                                step = 1; // الانتقال للمرحلة التالية
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
            // --- المرحلة 2: الالتفات لليسار (Liveness Check) ---
            else if (step === 1) {
                if (ratio < 0.6) { // إذا التفت لليسار بما فيه الكفاية
                    camBorder.className = "cam-box status-ok";
                    statusText.innerText = "✅ تم التحقق بنجاح";
                    statusText.style.color = "#10b981";
                    
                    finishFaceAuth(); // إنهاء وإرسال
                }
            }
        } else {
            camBorder.className = "cam-box status-err";
            statusText.innerText = "⚠️ لم يتم العثور على وجه";
            statusText.style.color = "#ef4444";
        }
    }, 500);
}

// ==========================================
// 📤 5. الإرسال وإنهاء العملية
// ==========================================

function finishFaceAuth() {
    // 1. تنظيف وإيقاف الكاميرا
    clearInterval(faceCheckInterval);
    if(videoStream) videoStream.getTracks().forEach(track => track.stop());

    // 2. تحديث الواجهة للمستخدم
    document.getElementById('screenFaceAuth').style.display = 'none';
    const scanScreen = document.getElementById('screenScanQR');
    scanScreen.style.display = 'block';
    
    // البحث عن عناصر النصوص داخل شاشة النجاح لتحديثها
    const h2Title = scanScreen.querySelector('h2') || document.createElement('h2');
    const pDesc = scanScreen.querySelector('p') || document.createElement('p');
    h2Title.innerText = "جاري إرسال البيانات...";
    pDesc.innerText = "يرجى الانتظار وعدم إغلاق الصفحة";

    // 3. تجهيز حزمة البيانات
    const finalPayload = {
        id: document.getElementById('uniID').value, 
        attendanceCode: document.getElementById('attendanceCode').value,
        vector: bestDescriptor, // بصمة الوجه للذكاء الاصطناعي
        lat: userLat,
        lng: userLng,
        deviceId: getDeviceId(), // 🛡️ مفتاح الجهاز لمنع الغش
        timestamp: new Date().toISOString()
    };
    
    console.log("Sending Payload:", finalPayload);

    // 4. الإرسال إلى Google Sheets
    // ملاحظة: نستخدم mode: 'no-cors' لتجنب مشاكل المتصفح مع جوجل شيت، 
    // ولكن هذا يعني أننا لن نستطيع قراءة رد السيرفر مباشرة، لذا نفترض النجاح إذا لم يحدث خطأ في الشبكة.
    
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload)
    })
    .then(() => {
        // نجاح الإرسال
        h2Title.innerText = "✅ تم تسجيل الحضور";
        h2Title.style.color = "#10b981";
        pDesc.innerText = "تم حفظ بياناتك وبصمة جهازك بنجاح.";
        
        // تشغيل صوت (اختياري)
        // new Audio('https://www.soundjay.com/buttons/sounds/button-3.mp3').play();
    })
    .catch(err => {
        // فشل الإتصال
        console.error("Submission Error:", err);
        h2Title.innerText = "❌ حدث خطأ";
        h2Title.style.color = "#ef4444";
        pDesc.innerText = "تأكد من اتصال الإنترنت وحاول مرة أخرى.";
        
        // زر إعادة المحاولة
        const retryBtn = document.createElement('button');
        retryBtn.innerText = "إعادة المحاولة";
        retryBtn.onclick = () => location.reload();
        retryBtn.style.marginTop = "15px";
        scanScreen.appendChild(retryBtn);
    });
}

// دالة الإلغاء
function cancelFaceAuth() {
    clearInterval(faceCheckInterval);
    if(videoStream) videoStream.getTracks().forEach(track => track.stop());
    
    document.getElementById('screenFaceAuth').style.display = 'none';
    document.getElementById('screenDataEntry').style.display = 'block';
}