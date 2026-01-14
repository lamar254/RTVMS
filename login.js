import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const db = getFirestore(app);

document.getElementById("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    localStorage.clear();

    const workId = document.getElementById("workId").value.trim().toUpperCase();
    const password = document.getElementById("password").value.trim();
    const errorMsg = document.getElementById("errorMsg");

    errorMsg.textContent = "";

    try {
        console.log("Login attempt for workID:", workId);
        console.log("Password entered:", password);
        const q = query(collection(db, "users"), where("workID", "==", workId));
        const querySnapshot = await getDocs(q);
        console.log("Query executed, docs found:", querySnapshot.size);

        if (querySnapshot.empty) {
            console.log("No user found with workID:", workId);
            throw new Error("User not registered by admin.");
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        console.log("User data retrieved:", userData);
        console.log("Stored password:", userData.password);
        console.log("Entered password:", password);

        if (userData.password !== password) {
            console.log("Password does not match");
            throw new Error("Incorrect password.");
        }

        console.log("Password matches");

        if (!userData.isActive) {
            console.log("Account is inactive");
            throw new Error("Your account is inactive. Contact admin.");
        }

        console.log("Account is active");

        // Store user data in localStorage for dashboard use
        localStorage.setItem("userRole", userData.role);
        localStorage.setItem("userName", userData.name);

        if (workId.startsWith("NRS")) {
            console.log("Redirecting to nurse-dashboard.html");
            window.location.href = "nurse-dashboard.html";
        } else if (workId.startsWith("DR")) {
            console.log("Redirecting to dashboard.html");
            window.location.href = "dashboard.html";
        } else {
            console.log("Work ID does not start with NRS or DR");
            throw new Error("Invalid Work ID format. Access denied.");
        }

    } catch (err) {
        errorMsg.textContent = err.message;
    }
});
