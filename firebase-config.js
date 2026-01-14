
 import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
 import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
 import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyAUGyvDfALjX1tqA22ilueoXeaLPZAj-Yk",
    authDomain: "rtvms-37333.firebaseapp.com",
    projectId: "rtvms-37333",
    storageBucket: "rtvms-37333.firebasestorage.app",
    messagingSenderId: "697676782546",
    appId: "1:697676782546:web:041284b488a4ea15fa860b"
  };

  
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);