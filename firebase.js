// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app"
import { getAnalytics } from "firebase/analytics"
import { getFirestore } from "firebase/firestore"

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
	apiKey: "AIzaSyCy3Ojw-4v3RH0DEePg8vynBvoea0YUwlo",
	authDomain: "bulsuscholar.firebaseapp.com",
	projectId: "bulsuscholar",
	storageBucket: "bulsuscholar.firebasestorage.app",
	messagingSenderId: "292842033309",
	appId: "1:292842033309:web:df52d4dcb7a11b97c5c474",
	measurementId: "G-SDF48HZTFL",
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const analytics = getAnalytics(app)
export const db = getFirestore(app)
