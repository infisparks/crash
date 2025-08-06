// firebase.ts
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth,  } from 'firebase/auth'; // Import getAuth and FirebaseAuth

const firebaseConfig = {
  apiKey: "AIzaSyC3q-Y8-ZhmzaYiCDwlo_QXWUkezmtb7R0",
  authDomain: "cafe-76239.firebaseapp.com",
  databaseURL: "https://cafe-76239-default-rtdb.firebaseio.com",
  projectId: "cafe-76239",
  storageBucket: "cafe-76239.firebasestorage.app",
  messagingSenderId: "714072187551",
  appId: "1:714072187551:web:ebfc7a242bcb2d7d20f8aa",
  measurementId: "G-18MBDXT6EN"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app); // Export the auth instance
export { app }; // Export the app instance