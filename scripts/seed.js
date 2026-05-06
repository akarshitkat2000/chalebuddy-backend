/**
 * scripts/seed.js — Fixed Version
 * Explicit slug on every guide to avoid E11000 null slug duplicate error
 *
 * Usage:
 *   node scripts/seed.js          (seed only, skip if data exists)
 *   node scripts/seed.js --reset  (drop existing + reseed)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

// ── Models ─────────────────────────────────────────────────────
const User             = require("../models/User");
const Guide            = require("../models/Guide");
const Stay             = require("../models/Stay");
const Transport        = require("../models/Transport");
const Trip             = require("../models/Trip");
const GuideApplication = require("../models/GuideApplication");
const Newsletter       = require("../models/Newsletter");
const Contact          = require("../models/Contact");
const Booking          = require("../models/Booking");

const RESET = process.argv.includes("--reset");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error("❌ MONGO_URI not set in .env"); process.exit(1); }

  await mongoose.connect(uri);
  console.log(`✅ Connected to MongoDB: ${uri.replace(/:([^@]+)@/, ":***@")}`);

  if (RESET) {
    console.log("🗑️  Dropping existing data...");
    await Promise.all([
      User.deleteMany({}), Guide.deleteMany({}), Stay.deleteMany({}),
      Transport.deleteMany({}), Trip.deleteMany({}),
      GuideApplication.deleteMany({}), Newsletter.deleteMany({}),
      Contact.deleteMany({}), Booking.deleteMany({}),
    ]);
    console.log("✅ Existing data dropped.");
  }

  // ── Users ───────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Admin@123", 12);

  const users = await User.insertMany([
    { name:"ChaleBuddy Admin", email:"admin@chalebuddy.in",  password:passwordHash, role:"admin",  active:true },
    { name:"Arjun Sharma",     email:"arjun@example.com",    password:passwordHash, role:"guide",  active:true },
    { name:"Meera Devi",       email:"meera@example.com",    password:passwordHash, role:"guide",  active:true },
    { name:"Test Traveler",    email:"traveler@example.com", password:passwordHash, role:"user",   active:true },
  ]);
  console.log(`✅ Seeded ${users.length} users`);

  // ── Guides — explicit slug on every entry ────────────────────
  const guidesData = [
    {
      slug: "arjun-sharma-old-delhi",
      name: "Arjun Sharma", city: "Old Delhi", state: "Delhi",
      type: "Heritage", rate: 1800, rating: 4.9, trips: 200,
      languages: ["Hindi","English"],
      tags: ["Heritage","History","Old Delhi"],
      img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=70",
      verified: true, featured: true, available: true, experience: 8,
      bio: "Expert heritage guide with 8 years exploring Old Delhi's hidden history.",
      highlights: ["Chandni Chowk","Red Fort","Jama Masjid"],
      contactEmail: "arjun@example.com",
    },
    {
      slug: "meera-devi-varanasi",
      name: "Meera Devi", city: "Varanasi", state: "Uttar Pradesh",
      type: "Spiritual", rate: 1500, rating: 5.0, trips: 310,
      languages: ["Hindi","English","Bengali"],
      tags: ["Spiritual","Ghats","Aarti"],
      img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=70",
      verified: true, featured: true, available: true, experience: 10,
      bio: "Born on the ghats, Meera brings Varanasi's soul to every traveler.",
      highlights: ["Dashashwamedh Ghat","Kashi Vishwanath","Morning Aarti"],
      contactEmail: "meera@example.com",
    },
    {
      slug: "rahul-nair-manali",
      name: "Rahul Nair", city: "Manali", state: "Himachal Pradesh",
      type: "Trekking", rate: 2200, rating: 4.8, trips: 145,
      languages: ["Hindi","English","Malayalam"],
      tags: ["Trekking","Adventure","Mountains"],
      img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=70",
      verified: true, featured: false, available: true, experience: 6,
      bio: "Certified trekking guide covering Rohtang, Solang Valley, and beyond.",
      highlights: ["Solang Valley","Rohtang Pass","Hampta Pass"],
    },
    {
      slug: "priya-menon-kochi",
      name: "Priya Menon", city: "Kochi", state: "Kerala",
      type: "Food", rate: 1200, rating: 4.7, trips: 98,
      languages: ["Malayalam","English","Hindi"],
      tags: ["Food","Culture","Kerala Cuisine"],
      img: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&q=70",
      verified: true, featured: false, available: true, experience: 4,
      bio: "Food historian and chef guide revealing Kerala's coastal culinary secrets.",
      highlights: ["Fort Kochi","Spice Markets","Backwater Dining"],
    },
    {
      slug: "vikram-singh-jaipur",
      name: "Vikram Singh", city: "Jaipur", state: "Rajasthan",
      type: "Heritage", rate: 1600, rating: 4.9, trips: 230,
      languages: ["Hindi","English","Rajasthani"],
      tags: ["Heritage","Forts","Rajasthan"],
      img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=70",
      verified: true, featured: true, available: true, experience: 12,
      bio: "Royal heritage expert with deep knowledge of Rajputana forts and palaces.",
      highlights: ["Amer Fort","Hawa Mahal","City Palace"],
    },
    {
      slug: "ananya-das-darjeeling",
      name: "Ananya Das", city: "Darjeeling", state: "West Bengal",
      type: "Nature", rate: 1400, rating: 4.8, trips: 112,
      languages: ["Bengali","English","Hindi","Nepali"],
      tags: ["Nature","Tea Garden","Himalaya"],
      img: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=400&q=70",
      verified: true, featured: false, available: true, experience: 5,
      bio: "Tea estate expert and nature guide showing Darjeeling's misty magic.",
      highlights: ["Happy Valley Tea Estate","Tiger Hill Sunrise","Batasia Loop"],
    },
  ];

  // Insert with { timestamps: true } — bypass pre-save so our slug is used
  const guides = await Guide.collection.insertMany(
    guidesData.map(g => ({
      ...g,
      bookingsCount: 0,
      bookedDates: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );
  console.log(`✅ Seeded ${guidesData.length} guides`);

  // ── Stays ───────────────────────────────────────────────────
  const staysData = [
    {
      slug: "haveli-wadi-jaipur",
      name: "Haveli Wadi", city: "Jaipur", area: "Bani Park", state: "Rajasthan",
      host: "Meena Sharma", hostInitials: "MS",
      img: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=70",
      rating: 4.9, ratingCount: 145,
      quickPrice: 500, overnightPrice: 1800,
      amenities: ["📶 WiFi","❄️ AC","🍛 Home Food","🧺 Laundry"],
      type: "homestay", verified: true, featured: true, available: true,
      maxGuests: 3, rooms: 2,
      description: "A traditional Rajasthani haveli with modern comforts and authentic home-cooked meals.",
    },
    {
      slug: "ganga-view-homestay-varanasi",
      name: "Ganga View Homestay", city: "Varanasi", area: "Dashashwamedh", state: "Uttar Pradesh",
      host: "Mohan Lal", hostInitials: "ML",
      img: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=600&q=70",
      rating: 4.8, ratingCount: 98,
      quickPrice: 280, overnightPrice: 1100,
      amenities: ["📶 WiFi","🛕 Ganga View","🍛 Chai & Breakfast","🚿 Geyser"],
      type: "quick", verified: true, featured: false, available: true,
      maxGuests: 2, rooms: 1,
      description: "Waking up to the sound of temple bells with a direct Ganga view.",
    },
    {
      slug: "alpine-retreat-manali",
      name: "Alpine Retreat", city: "Manali", area: "Naggar", state: "Himachal Pradesh",
      host: "Ravi Thakur", hostInitials: "RT",
      img: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=70",
      rating: 4.7, ratingCount: 62,
      quickPrice: 600, overnightPrice: 2200,
      amenities: ["⛰️ Valley View","🍛 Home Food","🚿 Geyser","🌲 Nature Walk"],
      type: "homestay", verified: true, featured: true, available: true,
      maxGuests: 4, rooms: 2,
      description: "Cozy mountain retreat with panoramic valley views and homemade Himachali food.",
    },
    {
      slug: "backpackers-hub-delhi",
      name: "Backpacker's Hub", city: "Delhi", area: "Paharganj", state: "Delhi",
      host: "Rajiv Gupta", hostInitials: "RG",
      img: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=600&q=70",
      rating: 4.5, ratingCount: 210,
      quickPrice: 200, overnightPrice: 700,
      amenities: ["📶 WiFi","🛌 Dorm Beds","🧳 Locker","🗺️ Travel Desk"],
      type: "overnight", verified: true, featured: false, available: true,
      maxGuests: 8, rooms: 1,
      description: "Budget-friendly backpacker hub in the heart of Delhi.",
    },
    {
      slug: "tea-garden-cottage-darjeeling",
      name: "Tea Garden Cottage", city: "Darjeeling", area: "Happy Valley", state: "West Bengal",
      host: "Anita Das", hostInitials: "AD",
      img: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=600&q=70",
      rating: 4.8, ratingCount: 55,
      quickPrice: 450, overnightPrice: 1600,
      amenities: ["🍵 Tea Tours","⛰️ Himalaya View","🌲 Garden Walk","🍛 Breakfast"],
      type: "homestay", verified: true, featured: false, available: true,
      maxGuests: 2, rooms: 1,
      description: "Nestled in a working tea garden with misty Himalayan views.",
    },
    {
      slug: "beachside-casa-goa",
      name: "Beachside Casa", city: "Goa", area: "Anjuna", state: "Goa",
      host: "Maria Fernandes", hostInitials: "MF",
      img: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=600&q=70",
      rating: 4.6, ratingCount: 91,
      quickPrice: 450, overnightPrice: 1800,
      amenities: ["📶 WiFi","🏖️ Beach Walk","🍛 Breakfast","❄️ AC"],
      type: "overnight", verified: true, featured: true, available: true,
      maxGuests: 3, rooms: 1,
      description: "Charming Portuguese-style villa steps away from Anjuna beach.",
    },
  ];

  await Stay.collection.insertMany(
    staysData.map(s => ({
      ...s,
      bookingsCount: 0,
      blockedDates: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );
  console.log(`✅ Seeded ${staysData.length} stays`);

  // ── Transport ────────────────────────────────────────────────
  const transportData = [
    { operator:"Rajdhani Express", number:"12301", mode:"train", vehicleType:"Premium AC", from:"New Delhi", fromCode:"NDLS", to:"Varanasi",  toCode:"BSB", dep:"06:00", arr:"14:25", duration:"8h 25m", stops:"Non-Stop", price:1450, avail:"avail",    availText:"Seats Available", opIcon:"🚂", sponsored:false },
    { operator:"Shatabdi Express",  number:"12015", mode:"train", vehicleType:"Chair Car",   from:"Delhi",     fromCode:"NDLS", to:"Jaipur",    toCode:"JP",  dep:"06:05", arr:"10:40", duration:"4h 35m", stops:"Non-Stop", price:750,  avail:"avail",    availText:"Seats Available", opIcon:"🚂", sponsored:false },
    { operator:"Humsafar Express",  number:"12595", mode:"train", vehicleType:"3rd AC",       from:"Mumbai",    fromCode:"CSMT", to:"Goa",       toCode:"MAO", dep:"22:00", arr:"08:30", duration:"10h 30m",stops:"2 Stops",  price:890,  avail:"limited",  availText:"6 Seats Left",   opIcon:"🚂", sponsored:true  },
    { operator:"Volvo AC Sleeper",  number:"VB-2341",mode:"bus", vehicleType:"AC Semi-Sleeper",from:"Delhi",   fromCode:"ISBT", to:"Manali",    toCode:"Old Bus Stand", dep:"17:30", arr:"09:00", duration:"15h 30m",stops:"1 Stop",   price:1100, avail:"avail",    availText:"Seats Available", opIcon:"🚌", sponsored:false },
    { operator:"KSRTC Airavat",     number:"KA-5872",mode:"bus", vehicleType:"AC Sleeper",    from:"Bangalore",fromCode:"Majestic",to:"Goa",   toCode:"Panaji",        dep:"21:00", arr:"07:30", duration:"10h 30m",stops:"Non-Stop", price:900,  avail:"avail",    availText:"Seats Available", opIcon:"🚌", sponsored:false },
    { operator:"IndiGo",            number:"6E-2341",mode:"flight",vehicleType:"Economy",     from:"New Delhi",fromCode:"DEL",  to:"Mumbai",    toCode:"BOM", dep:"07:00", arr:"09:15", duration:"2h 15m",  stops:"Non-Stop", price:4299, avail:"avail",    availText:"Seats Available", opIcon:"✈️", sponsored:false },
    { operator:"Air India",         number:"AI-663", mode:"flight",vehicleType:"Economy",     from:"Delhi",    fromCode:"DEL",  to:"Goa",       toCode:"GOI", dep:"09:30", arr:"12:00", duration:"2h 30m",  stops:"Non-Stop", price:5800, avail:"limited",  availText:"4 Seats Left",   opIcon:"✈️", sponsored:false },
  ];

  await Transport.insertMany(transportData);
  console.log(`✅ Seeded ${transportData.length} transport routes`);

  // ── Trips — fields match Trip.js schema exactly ──────────────
  const [traveler] = users.filter(u => u.role === "user");
  await Trip.insertMany([
    {
      title: "Banaras Spiritual Tour",
      destination: "Varanasi", state: "Uttar Pradesh",
      creatorName: traveler.name,
      user: traveler._id,
      travelDate: new Date("2026-06-20"),
      duration: "3-5 Days",
      budget: "Budget (Below ₹5k)",
      description: "Looking for 2 people to join for morning Aarti and street food tour.",
      interests: ["Spiritual","Street Food"],
      maxBuddies: 4, gender: "Any", active: true,
      img: "https://images.unsplash.com/photo-1561361058-c24e022e2a8d?w=600&q=70"
    },
    {
      title: "Manali Trekking Buddy",
      destination: "Manali", state: "Himachal Pradesh",
      creatorName: traveler.name,
      user: traveler._id,
      travelDate: new Date("2026-07-15"),
      duration: "4-7 Days",
      budget: "Mid-range (₹5k–₹15k)",
      description: "Planning Solang Valley. Budget-friendly. Solo travelers welcome!",
      interests: ["Trekking","Adventure"],
      maxBuddies: 3, gender: "Any", active: true,
      img: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=70"
    },
    {
      title: "Darjeeling Tea Garden",
      destination: "Darjeeling", state: "West Bengal",
      creatorName: traveler.name,
      user: traveler._id,
      travelDate: new Date("2026-08-05"),
      duration: "1-3 Days",
      budget: "Mid-range (₹5k–₹15k)",
      description: "Looking for someone to explore tea gardens and authentic local cuisine.",
      interests: ["Nature","Food"],
      maxBuddies: 2, gender: "Any", active: true,
      img: "https://images.unsplash.com/photo-1623676631479-3f1862f86ff6?w=600&q=70"
    },
  ]);
  console.log("✅ Seeded 3 trips");

  console.log("\n🎉 Seed complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Admin login:");
  console.log("  Email:    admin@chalebuddy.in");
  console.log("  Password: Admin@123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch(err => { console.error("❌ Seeding failed:", err.message); console.error(err); })
  .finally(() => mongoose.disconnect().then(() => console.log("🔌 Disconnected from MongoDB")));