console.log("NEW PATIENT JS LOADED");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUGyvDfALjX1tqA22ilueoXeaLPZAj-Yk",
  authDomain: "rtvms-37333.firebaseapp.com",
  projectId: "rtvms-37333",
  storageBucket: "rtvms-37333.appspot.com",
  messagingSenderId: "697676782546",
  appId: "1:697676782546:web:041284b488a4ea15fa860b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log("Firestore initialized:", db);

// Update topbar with user info
const userRole = localStorage.getItem("userRole");
const userName = localStorage.getItem("userName");
if (userRole === "nurse" && userName) {
  const firstName = userName.split(" ")[0];
  document.getElementById("userName").textContent = "NRS/" + firstName;
} else if (userRole === "doctor" && userName) {
  const firstName = userName.split(" ")[0];
  document.getElementById("userName").textContent = "DR/" + firstName;
}


const form = document.getElementById("admitPatientForm");
const statusMsg = document.getElementById("admissionStatus");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("patientName").value;
  const age = document.getElementById("patientAge").value;
  const bed = document.getElementById("patientBed").value;
  const condition = document.getElementById("patientCondition").value;
  const admissionDate = document.getElementById("admissionDate").value;


  const initialHR = Math.max(40, Math.min(180, Number(document.getElementById("initialHR").value) || 78));
  const initialBP1 = Math.max(80, Math.min(200, Number(document.getElementById("initialBP1").value) || 120));
  const initialBP2 = Math.max(50, Math.min(120, Number(document.getElementById("initialBP2").value) || 80));
  const initialOxygen = Math.max(70, Math.min(100, Number(document.getElementById("initialOxygen").value) || 97));
  const initialTemp = Math.max(35, Math.min(42, Number(document.getElementById("initialTemp").value) || 36.5));
  const initialRR = Math.max(8, Math.min(40, Number(document.getElementById("initialRR").value) || 16));

  try {
    await addDoc(collection(db, "patients"), {
      name,
      age,
      bed,
      condition,
      admissionDate,
      assignedDoctor: null,
      criticalLevel: "normal",
      currentVitals: {
        heartRate: initialHR || null,
        bpSystolic: initialBP1 || null,
        bpDiastolic: initialBP2 || null,
        oxygen: initialOxygen || null,
        temperature: initialTemp || null,
        respiratoryRate: initialRR || null,
      },
      createdAt: new Date(),
    });

    statusMsg.textContent = "Patient successfully admitted!";
    statusMsg.style.color = "green";
    form.reset();
  } catch (error) {
    console.error(error);
    statusMsg.textContent = "Error! Could not save patient.";
    statusMsg.style.color = "red";
  }
});
