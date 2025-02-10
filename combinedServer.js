const express = require("express")
const { MongoClient, ObjectId } = require("mongodb")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const mongoose = require("mongoose")
const bodyParser = require("body-parser")

const app = express()
const port = 3002

const mongoUrl = "mongodb://localhost:27017"
const dbName = "maidFinderSystem"

// Middleware to parse JSON and URL-encoded data
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(__dirname))

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = "uploads/"
    if (file.fieldname === "idProofImage") {
      uploadPath += "id_proofs/"
    } else if (file.fieldname === "profilePicture") {
      uploadPath += "profile_pictures/"
    } else if (file.fieldname === "photo") {
      uploadPath += "maid_photos/"
    }
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true })
    }
    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname)
  },
})

const upload = multer({ storage: storage })

// MongoDB connection
async function connectToMongo() {
  const client = new MongoClient(mongoUrl, { useUnifiedTopology: true })
  try {
    await client.connect()
    console.log("Connected successfully to MongoDB")
    return client.db(dbName)
  } catch (err) {
    console.error("Error connecting to MongoDB:", err)
    throw err
  }
}

// Frontend routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "city.html"))
})

app.get("/results.html", (req, res) => {
  res.sendFile(path.join(__dirname, "results.html"))
})

// Admin routes
app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "adminLogin.html"))
})

app.post("/admin/login", async (req, res) => {
  try {
    const db = await connectToMongo()
    const collection = db.collection("admins")
    const admin = await collection.findOne({ username: req.body.username })

    if (admin && req.body.password === admin.password) {
      res.json({ message: "Login successful", adminId: admin._id })
    } else {
      res.status(401).json({ error: "Invalid username or password" })
    }
  } catch (error) {
    console.error("Error during admin login:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// User registration
app.post(
  "/register",
  upload.fields([
    { name: "idProofImage", maxCount: 1 },
    { name: "profilePicture", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { firstName, lastName, username, password, email, phoneNumber, address } = req.body
      const idProofImage = req.files["idProofImage"]?.[0].path || null
      const profilePicture = req.files["profilePicture"]?.[0].path || null

      const db = await connectToMongo()
      const collection = db.collection("users")

      const result = await collection.insertOne({
        firstName,
        lastName,
        username,
        password,
        email,
        phoneNumber,
        address,
        idProofImage,
        profilePicture,
        createdAt: new Date(),
      })

      res.status(201).json({ message: "User registered successfully!", userId: result.insertedId })
    } catch (error) {
      console.error("Error during user registration:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// User login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body

    // Connect to MongoDB
    const db = await connectToMongo()
    const collection = db.collection("users")

    // Find user by username
    const user = await collection.findOne({ username })

    if (user && user.password === password) {
      // Login successful
      res.json({
        message: "Login successful",
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
      })
    } else {
      // Invalid credentials
      res.status(401).json({ error: "Invalid username or password" })
    }
  } catch (error) {
    console.error("Error during user login:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// User profile
app.get("/profile", async (req, res) => {
  const userId = req.query.id // Changed from userId to id to match the client-side

  try {
    const db = await connectToMongo()
    const collection = db.collection("users")

    // Fetch user details from the database
    const user = await collection.findOne({ _id: new ObjectId(userId) })

    if (user) {
      res.json({
        message: "User profile retrieved successfully",
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          address: user.address,
          profilePicture: user.profilePicture,
        },
      })
    } else {
      res.status(404).json({ error: "User not found" })
    }
  } catch (error) {
    console.error("Error retrieving user profile:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Admin dashboard route
app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "adminDashboard.html"))
})

// Maid registration form route
app.get("/maid-registration", (req, res) => {
  res.sendFile(path.join(__dirname, "maidForm.html"))
})

// Maid registration form submission
app.post(
  "/register-maid",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "idProofImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { fullName, email, gender, locality, serviceType, workingHours, experience, salary, idProof } = req.body

      const photo = req.files["photo"]?.[0].path || null
      const idProofImage = req.files["idProofImage"]?.[0].path || null

      const db = await connectToMongo()
      const collection = db.collection("maids")

      const result = await collection.insertOne({
        fullName,
        email,
        gender,
        locality,
        serviceType,
        workingHours,
        experience,
        salary,
        idProof,
        photo,
        idProofImage,
        createdAt: new Date(),
      })

      res.json({ success: true, message: "Maid registered successfully!" })
    } catch (error) {
      console.error("Error during maid registration:", error)
      res.status(500).json({ success: false, message: "An error occurred during registration. Please try again." })
    }
  },
)

// Maid search endpoint
app.post("/api/search-maids", async (req, res) => {
  try {
    const { locality, serviceType } = req.body
    const db = await connectToMongo()
    const collection = db.collection("maids")

    const query = { locality, serviceType }
    const maids = await collection.find(query).toArray()

    res.json(maids)
  } catch (error) {
    console.error("Error searching for maids:", error)
    res.status(500).json({ error: "An error occurred while searching for maids. Please try again." })
  }
})

// Add a new endpoint for booking a maid
app.post("/api/book-maid", async (req, res) => {
  try {
    const { maidId, userId, date, days, hours } = req.body
    const db = await connectToMongo()
    const bookingsCollection = db.collection("bookings")

    const result = await bookingsCollection.insertOne({
      maidId,
      userId,
      date,
      days,
      hours,
      status: "Pending",
      createdAt: new Date(),
    })

    res.json({ success: true, bookingId: result.insertedId })
  } catch (error) {
    console.error("Error booking maid:", error)
    res.status(500).json({ error: "An error occurred while booking the maid. Please try again." })
  }
})

// Serve userForm.html
app.get("/userForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "userForm.html"))
})

// Handle maid booking
app.post("/book-maid", async (req, res) => {
  try {
    const db = await connectToMongo()
    const collection = db.collection("orders")

    const bookingData = {
      ...req.body,
      status: "Pending",
      createdAt: new Date(),
    }

    const result = await collection.insertOne(bookingData)

    if (result.insertedId) {
      res.status(200).json({ message: "Booking successful" })
    } else {
      res.status(500).json({ error: "Failed to create booking" })
    }
  } catch (error) {
    console.error("Error during booking:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Add a new endpoint to serve the orders page
app.get("/orders.html", (req, res) => {
  res.sendFile(path.join(__dirname, "orders.html"))
})

// Connect to MongoDB
mongoose.connect("mongodb://localhost/maidFinderSystem", { useNewUrlParser: true, useUnifiedTopology: true })

// Define schemas
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  // Add other user fields as needed
})

const maidSchema = new mongoose.Schema({
  name: String,
  // Add other maid fields as needed
})

const orderSchema = new mongoose.Schema({
  serviceman: String,
  customer: String,
  service_name: String,
  date: String,
  days: Number,
  hours: Number,
  status: { type: String, default: "Pending" },
})

// Handle maid booking
app.post("/book-maid", async (req, res) => {
  try {
    const db = await connectToMongo()
    const collection = db.collection("orders")

    const bookingData = {
      ...req.body,
      status: "Pending",
      createdAt: new Date(),
    }

    const result = await collection.insertOne(bookingData)

    if (result.insertedId) {
      res.status(200).json({ message: "Booking successful" })
    } else {
      res.status(500).json({ error: "Failed to create booking" })
    }
  } catch (error) {
    console.error("Error during booking:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create models
const User = mongoose.model("User", userSchema)
const Maid = mongoose.model("Maid", maidSchema)
const Order = mongoose.model("Order", orderSchema)

app.use(bodyParser.json())

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})

