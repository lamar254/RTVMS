console.log("REGISTER JS LOADED");

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

const form = document.getElementById("registerForm");

let statusMsg = document.createElement("p");
form.appendChild(statusMsg);

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const workID = document.getElementById("workID").value.trim().toUpperCase();
  const nationalID = document.getElementById("nationalID").value.trim();
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const title = document.getElementById("title").value;
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;


  if(password !== confirmPassword){
    statusMsg.textContent = "Passwords do not match!";
    statusMsg.style.color = "red";
    return;
  }

  if(!/^NRS\d+$/.test(workID) && !/^DR\d+$/.test(workID)){
    statusMsg.textContent = "Invalid Work ID format. Use NRSxxx or DRxxx.";
    statusMsg.style.color = "red";
    return;
  }

  if(title !== "Nurse" && title !== "Doctor"){
    statusMsg.textContent = "Please select a valid role.";
    statusMsg.style.color = "red";
    return;
  }

  try {

    console.log("Attempting to add user to Firestore...");
    const docRef = await addDoc(collection(db, "users"), {
      workID,
      nationalID,
      name,
      role: title.toLowerCase(),
      password: password,
      isActive: true,
      createdAt: new Date()
    });

    console.log("User successfully added with ID:", docRef.id);
    statusMsg.textContent = "User registered successfully!";
    statusMsg.style.color = "green";
    form.reset();

  } catch(err) {
    console.error("Error registering user:", err);
    statusMsg.textContent = "Error registering user: " + err.message;
    statusMsg.style.color = "red";
  }
});
