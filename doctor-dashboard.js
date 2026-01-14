import { getDocs, collection, addDoc, onSnapshot, query, where, orderBy, limit, deleteDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

// Check if user is logged in as doctor
const userRole = localStorage.getItem("userRole");
const userName = localStorage.getItem("userName");
if (!userRole || userRole !== "doctor" || !userName) {
  window.location.href = "login.html";
}

let PATIENTS = [];
let alertThrottle = {};

let selectedPatient = null;
let muted = false;
let alertThresholds = { hr: 50, spo2: 92 };

const patientListEl = document.getElementById('patientList');
const patNameEl = document.getElementById('patName');
const patMetaEl = document.getElementById('patMeta');
const patAvatar = document.getElementById('patAvatar');
const statHR = document.getElementById('stat-hr');
const statSpO2 = document.getElementById('stat-spo2');
const statTemp = document.getElementById('stat-temp');
const statBP = document.getElementById('stat-bp');
const statRR = document.getElementById('stat-rr');
const statLast = document.getElementById('stat-last');
const commentsArea = document.getElementById('commentsArea');
const recordsList = document.getElementById('recordsList');
const alertsList = document.getElementById('alertsList');
const alertAudio = document.getElementById('alertAudio');
const muteBtn = document.getElementById('muteBtn');

function calculateAge(dob) {
  if (!dob) return 'N/A';
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return 'N/A';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

const canvas = document.getElementById('waveform');
const ctx = canvas.getContext('2d');
const width = canvas.width;
const height = canvas.height;
let t = 0;
let waveAnimationId = null;

function drawWave() {
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.moveTo(0, height/2);

  for(let x=0; x<width; x++) {
    const amp = selectedPatient ? 20 : 5;
    const y = height/2 + amp * Math.sin((x + t)/10) + (amp/4) * Math.sin((x + t)/3);
    ctx.lineTo(x, y);
  }

  ctx.strokeStyle = 'rgba(14,165,164,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  t += 2;
  waveAnimationId = requestAnimationFrame(drawWave);
}

if(!waveAnimationId) drawWave(); 

function renderPatients(filter=''){
  patientListEl.innerHTML='';
  PATIENTS.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase())).forEach(p=>{
    const ageDisplay = p.age || calculateAge(p.dob);
    const displayName = p.name || `${ageDisplay} years`;
    const avatarText = p.name ? p.name.split(' ').map(n=>n[0]).slice(0,2).join('') : ageDisplay.toString();
    const wardDisplay = p.ward || 'CAT';
    const bedDisplay = p.bed || 'CAT';
    const ageMeta = (ageDisplay && ageDisplay !== 'N/A') ? ` • ${ageDisplay} yrs` : '';
    const div = document.createElement('div');
    div.className='patient';
    if(selectedPatient && selectedPatient.id===p.id) div.classList.add('active');
    div.innerHTML = `<div class="avatar">${avatarText}</div><div class="meta"><h4>${displayName}</h4><p>${bedDisplay}${ageMeta}</p></div>`;
    div.onclick = ()=>selectPatient(p);
    patientListEl.appendChild(div);
  })
}
renderPatients();
document.getElementById('search').addEventListener('input',(e)=>renderPatients(e.target.value));

function selectPatient(p){
  selectedPatient = p;
  const ageDisplay = p.age || calculateAge(p.dob);
  const ageText = (ageDisplay && ageDisplay !== 'N/A') ? `${ageDisplay} years` : '';
  patNameEl.textContent = p.name || ageText;
  patMetaEl.textContent = `Bed ${p.bed || 'CAT'}${ageText ? ` • ${ageText}` : ''}`;
  patAvatar.textContent = p.name ? p.name.split(' ').map(x=>x[0]).slice(0,2).join('') : ageDisplay.toString();
  loadRecords();
  loadComments();
  listenForVitals();

  // Initialize abnormality tracking
  selectedPatient.abnormalStartTime = null;
  selectedPatient.alertedForAbnormality = false;

  // Initialize alert throttling
  selectedPatient.alertCount = 0;
  selectedPatient.lastResetTime = Date.now();

  document.querySelectorAll('.patient').forEach(el=>el.classList.remove('active'));
  const nodes = Array.from(document.querySelectorAll('.patient'));
  const idx = PATIENTS.findIndex(pp=>pp.id===p.id);
  if(nodes[idx]) nodes[idx].classList.add('active');
}

function commentsKey(){return `notes_${selectedPatient?selectedPatient.id:'none'}`}
function loadComments(){
  commentsArea.innerHTML='';
  if(!selectedPatient) return;
  const notes = JSON.parse(localStorage.getItem(commentsKey())||'[]');
  notes.slice().reverse().forEach(n=>{
    const d = document.createElement('div'); d.className='note';
    d.innerHTML = `<div style="font-size:12px;color:var(--muted)"><strong>${n.by}</strong> • ${new Date(n.at).toLocaleString()}</div><div style="margin-top:6px">${escapeHtml(n.text)}</div>`;
    commentsArea.appendChild(d);
  })
}

function loadRecords(){
  recordsList.innerHTML='';
  if(!selectedPatient) return;
  const recs = [];
  if(selectedPatient.admissionDate) {
    const admissionDate = new Date(selectedPatient.admissionDate);
    const formattedDate = admissionDate.toLocaleDateString();
    const formattedTime = admissionDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    recs.push({
      title: 'Admission',
      detail: selectedPatient.condition || 'No diagnosis specified',
      time: `${formattedDate} ${formattedTime}`
    });
  }
  recs.forEach(r=>{
    const rr = document.createElement('div'); rr.className='record-row';
    rr.innerHTML = `<div><strong>${r.title}</strong><div style="font-size:13px;color:var(--muted)">${r.detail}</div></div><div style="font-size:12px;color:var(--muted)">${r.time}</div>`;
    recordsList.appendChild(rr);
  })
}

function getAlertSeverity(hr, spo2, bpSys, bpDia, temp, rr) {
  // Critical conditions (immediate attention required)
  if (hr < 50 || hr > 150 || spo2 < 85 || bpSys < 80 || bpSys > 180 || bpDia < 50 || bpDia > 110 || temp < 35 || temp > 40 || rr < 8 || rr > 30) {
    return 'critical';
  }
  // High priority (requires attention)
  if (hr < 60 || hr > 120 || spo2 < 92 || bpSys >= 140 || bpDia >= 90 || temp < 36.1 || temp > 38.3 || rr < 12 || rr > 20) {
    return 'high';
  }
  // Moderate (monitor)
  if (hr < 65 || hr > 110 || spo2 < 95 || bpSys >= 130 || bpDia >= 80 || temp < 36.5 || temp > 37.5 || rr < 14 || rr > 18) {
    return 'moderate';
  }
  // Normal
  return 'normal';
}

async function pushAlert(msg, severity = 'normal') {
  if (!selectedPatient) return;

  const patientId = selectedPatient.id;
  const now = Date.now();

  // Initialize throttling for this patient if not exists
  if (!alertThrottle[patientId]) {
    alertThrottle[patientId] = { alertCount: 0, lastResetTime: now };
  }

  // Throttling: Check if 10 seconds have passed since last reset
  if (now - alertThrottle[patientId].lastResetTime >= 10000) {
    alertThrottle[patientId].alertCount = 0;
    alertThrottle[patientId].lastResetTime = now;
  }

  // If alert count is less than 2, allow the alert
  if (alertThrottle[patientId].alertCount < 2) {
    alertThrottle[patientId].alertCount++;
    try {
      await addDoc(collection(db, "alerts"), {
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        message: msg,
        severity: severity,
        timestamp: new Date()
      });
    } catch (error) {
      console.error("Error adding alert: ", error);
    }
  }
}

function displayAlert(alertData) {
  if (alertData.severity === 'normal') return;
  const el = document.createElement('div');
  el.style.padding = '8px';
  el.style.borderRadius = '8px';
  el.style.marginTop = '8px';
  el.style.cursor = 'pointer'; // Make it clickable

  // Color coding based on severity
  let background, textColor, borderColor;
  switch (alertData.severity) {
    case 'critical':
      background = 'linear-gradient(90deg,#ffcccc,#ffdddd)';
      textColor = '#cc0000';
      borderColor = '#ff0000';
      break;
    case 'high':
      background = 'linear-gradient(90deg,#ffecec,#fff4f4)';
      textColor = '#d32f2f';
      borderColor = '#f44336';
      break;
    case 'moderate':
      background = 'linear-gradient(90deg,#fff8e6,#fff9e6)';
      textColor = '#f57c00';
      borderColor = '#ff9800';
      break;
    default: // normal
      background = 'linear-gradient(90deg,#e8f5e8,#f1f8e9)';
      textColor = '#2e7d32';
      borderColor = '#4caf50';
  }

  el.style.background = background;
  el.style.border = `1px solid ${borderColor}`;
  el.innerHTML = `<div style='font-weight:700;color:${textColor}'>${alertData.message}</div><div style='font-size:12px;color:var(--muted);margin-top:6px'>${new Date(alertData.timestamp.seconds * 1000).toLocaleTimeString()}</div>`;
  alertsList.prepend(el);

  // Click to select patient
  el.addEventListener('click', () => {
    const patient = PATIENTS.find(p => p.id === alertData.patientId);
    if (patient) {
      selectPatient(patient);
    }
  });

  // Auto-clear alert after 15 seconds
  setTimeout(() => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }, 15000);

  // Audio alerts for all abnormal vitals
  if (!muted) {
    try { alertAudio.currentTime = 0; alertAudio.play(); } catch (e) { }
  }

  const card = document.getElementById('selectedPatientCard');
  if (card) {
    card.classList.add('alerting');
    setTimeout(() => card.classList.remove('alerting'), 3000);
  }
}

function listenForAlerts() {
  const q = query(collection(db, "alerts"), orderBy("timestamp", "desc"), limit(5)); // Show recent alerts for all patients
  onSnapshot(q, (querySnapshot) => {
    alertsList.innerHTML = ''; // Clear and re-populate to avoid duplicates
    querySnapshot.forEach((doc) => {
      displayAlert(doc.data());
    });
  });
}

function listenForVitals() {
  if (!selectedPatient) return;

  const patientRef = doc(db, "patients", selectedPatient.id);
  onSnapshot(patientRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      selectedPatient.currentVitals = data.currentVitals || {};
      // Update displayed vitals
      updateVitalsDisplay();
    }
  });
}

function updateVitalsDisplay() {
  if (!selectedPatient || !selectedPatient.currentVitals) return;

  const vitals = selectedPatient.currentVitals;
  if (statHR) statHR.textContent = `${vitals.heartRate || 78} bpm`;
  if (statSpO2) statSpO2.textContent = `${vitals.oxygen || 97} %`;
  if (statTemp) statTemp.textContent = `${vitals.temperature || 36.5} °C`;
  if (statBP) statBP.textContent = `${vitals.bpSystolic || 120} / ${vitals.bpDiastolic || 80}`;
  if (statRR) statRR.textContent = `${vitals.respiratoryRate || 16} rpm`;
  if (statLast) statLast.textContent = new Date().toLocaleTimeString();
}


if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? 'Unmute Alerts' : 'Mute Alerts';
  });
}

const clearCommentsBtn = document.getElementById('clearCommentsBtn');
if (clearCommentsBtn) {
  clearCommentsBtn.addEventListener('click', () => {
    if (selectedPatient) {
      localStorage.removeItem(commentsKey());
      loadComments();
    }
  });
}

function escapeHtml(text){ return text.replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }






// Fetch patients from Firestore
async function loadPatients() {
  try {
    const querySnapshot = await getDocs(collection(db, "patients"));
    PATIENTS = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      PATIENTS.push({
        id: doc.id,
        name: data.name,
        age: data.age,
        dob: data.dob,
        ward: data.ward,
        bed: data.bed,
        admissionDate: data.admissionDate,
        condition: data.condition,
        currentVitals: data.currentVitals || {}
      });
    });
    renderPatients();
    if (PATIENTS.length > 0) {
      selectPatient(PATIENTS[0]);
    }
  } catch (error) {
    console.error("Error loading patients: ", error);
  }
}

async function simulateVitalsOnce() {
  if (!selectedPatient) return;

  // Use configured vitals if available, otherwise random
  const baseHR = selectedPatient.currentVitals?.heartRate || 78;
  const baseBP1 = selectedPatient.currentVitals?.bpSystolic || 120;
  const baseBP2 = selectedPatient.currentVitals?.bpDiastolic || 80;
  const baseSpO2 = selectedPatient.currentVitals?.oxygen || 97;
  const baseTemp = selectedPatient.currentVitals?.temperature || 36.5;
  const baseRR = selectedPatient.currentVitals?.respiratoryRate || 16;

  // Force abnormal vitals to trigger alerts
  const hr = Math.max(40, Math.min(180, baseHR - 30));
  const spo2 = Math.max(70, Math.min(100, baseSpO2 - 10));
  const temp = Math.max(35, Math.min(42, parseFloat((baseTemp - 5).toFixed(1))));
  const bpSys = Math.max(80, Math.min(200, baseBP1 - 50));
  const bpDia = Math.max(50, Math.min(120, baseBP2 - 30));
  const rr = Math.max(8, Math.min(40, baseRR - 10));

  const ts = new Date().toLocaleTimeString();

  // Update display
  if (statHR) statHR.textContent = `${hr} bpm`;
  if (statSpO2) statSpO2.textContent = `${spo2} %`;
  if (statTemp) statTemp.textContent = `${temp} °C`;
  if (statBP) statBP.textContent = `${bpSys} / ${bpDia}`;
  if (statRR) statRR.textContent = `${rr} rpm`;
  if (statLast) statLast.textContent = ts;

  // Update Firestore with new vitals
  try {
    await updateDoc(doc(db, "patients", selectedPatient.id), {
      currentVitals: {
        heartRate: hr,
        bpSystolic: bpSys,
        bpDiastolic: bpDia,
        oxygen: spo2,
        temperature: parseFloat(temp),
        respiratoryRate: rr,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error("Error updating vitals: ", error);
  }

  // Determine alert severity based on all vitals
  const severity = getAlertSeverity(hr, spo2, bpSys, bpDia, parseFloat(temp), rr);

  if (severity !== 'normal') {
    // Start tracking abnormal readings
    if (selectedPatient.abnormalStartTime === null) {
      selectedPatient.abnormalStartTime = Date.now();
    }

    // Check if abnormal for more than 2 seconds
    if (Date.now() - selectedPatient.abnormalStartTime > 2000 && !selectedPatient.alertedForAbnormality) {
      let alertMsg = `${selectedPatient.name} — `;
      switch (severity) {
        case 'critical':
          alertMsg += `CRITICAL: HR ${hr} bpm, SpO₂ ${spo2}%, BP ${bpSys}/${bpDia}, Temp ${temp}°C, RR ${rr}`;
          break;
        case 'high':
          alertMsg += `High Priority: HR ${hr} bpm, SpO₂ ${spo2}%, BP ${bpSys}/${bpDia}`;
          break;
        case 'moderate':
          alertMsg += `Monitor: HR ${hr} bpm, SpO₂ ${spo2}%, BP ${bpSys}/${bpDia}`;
          break;
      }
      pushAlert(alertMsg, severity);
      selectedPatient.alertedForAbnormality = true;
    }
  } else {
    // Reset tracking when vitals return to normal
    selectedPatient.abnormalStartTime = null;
    selectedPatient.alertedForAbnormality = false;
  }
}
setInterval(simulateVitalsOnce, 2000);

loadPatients();

listenForAlerts();

const dischargeBtn = document.getElementById('dischargeBtn');
if (dischargeBtn) {
  dischargeBtn.addEventListener('click', async () => {
    if (!selectedPatient) {
      alert('Please select a patient to discharge.');
      return;
    }
    if (confirm(`Are you sure you want to discharge ${selectedPatient.name}?`)) {
      try {
        await deleteDoc(doc(db, "patients", selectedPatient.id));
        selectedPatient = null;
        patNameEl.textContent = 'Select a patient';
        patMetaEl.textContent = 'Ward — Bed';
        patAvatar.textContent = 'A';
        loadPatients();
      } catch (error) {
        console.error("Error discharging patient: ", error);
        alert('Error discharging patient.');
      }
    }
  });
}

// Download patient data functionality
const downloadBtn = document.getElementById('downloadBtn');
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    if (!selectedPatient) {
      alert('Please select a patient first.');
      return;
    }
    downloadPatientData();
  });
}

async function downloadPatientData() {
  if (!selectedPatient) {
    alert('Please select a patient first.');
    return;
  }

  if (!selectedPatient.id) {
    alert('Selected patient has no valid ID. Please try selecting the patient again.');
    return;
  }

  try {
    // Get patient data from Firestore
    const patientDoc = await getDoc(doc(db, "patients", selectedPatient.id));

    if (!patientDoc.exists()) {
      alert('Patient data not found in database. Please try again.');
      return;
    }

    const patientData = patientDoc.data();

    // Get comments from localStorage
    const commentsKey = `notes_${selectedPatient.id}`;
    const comments = safeParse(localStorage.getItem(commentsKey), []);

    // Create CSV content
    let csvContent = 'Patient Data Report\n\n';

    // Patient Information
    csvContent += 'Patient Information\n';
    csvContent += `Name,${patientData.name || 'N/A'}\n`;
    csvContent += `Age,${patientData.age || 'N/A'}\n`;
    csvContent += `Date of Birth,${patientData.dob ? new Date(patientData.dob).toLocaleDateString() : 'N/A'}\n`;
    csvContent += `Ward,${patientData.ward || 'N/A'}\n`;
    csvContent += `Bed,${patientData.bed || 'N/A'}\n`;
    csvContent += `Admission Date,${patientData.admissionDate ? new Date(patientData.admissionDate).toLocaleDateString() : 'N/A'}\n`;
    csvContent += `Condition,${patientData.condition || 'N/A'}\n\n`;

    // Current Vitals
    csvContent += 'Current Vitals\n';
    const vitals = patientData.currentVitals || {};
    csvContent += `Heart Rate,${vitals.heartRate || 'N/A'} bpm\n`;
    csvContent += `SpO₂,${vitals.oxygen || 'N/A'} %\n`;
    csvContent += `Temperature,${vitals.temperature || 'N/A'} °C\n`;
    csvContent += `Blood Pressure,${vitals.bpSystolic || 'N/A'} / ${vitals.bpDiastolic || 'N/A'}\n`;
    csvContent += `Respiratory Rate,${vitals.respiratoryRate || 'N/A'} rpm\n\n`;

    // Comments
    if (comments.length > 0) {
      csvContent += 'Comments\n';
      comments.forEach((comment, index) => {
        const commentText = `${comment.by} (${new Date(comment.at).toLocaleString()}): ${comment.text}`;
        csvContent += `${index + 1},"${commentText.replace(/"/g, '""')}"\n`;
      });
      csvContent += '\n';
    }

    // Footer
    csvContent += `Downloaded by,${localStorage.getItem("userName") || "Unknown"}\n`;
    csvContent += `Downloaded at,${new Date().toLocaleString()}\n`;

    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedPatient.name.replace(/\s+/g, '_')}_data.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (error) {
    console.error("Error downloading patient data: ", error);
    alert('Error downloading patient data. Please try again.');
  }
}

// Update topbar with user info
console.log("userRole:", userRole, "userName:", userName);
if (userRole && userRole.toLowerCase() === "doctor" && userName) {
  console.log("Setting user name to:", "Dr " + userName.charAt(0).toUpperCase() + userName.slice(1));
  document.getElementById("userName").textContent = "Dr " + userName.charAt(0).toUpperCase() + userName.slice(1);
} else {
  console.log("Condition not met for user name update");
}

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    window.location.href = 'login.html';
  });
}
