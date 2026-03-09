import { writeFile, mkdir } from "fs/promises"

const API_URL = "https://cpw-tracker.p.rapidapi.com/"
const API_KEY = process.env.RAPIDAPI_KEY

if (!API_KEY) {
  console.error("Error: RAPIDAPI_KEY environment variable is required")
  process.exit(1)
}

/**
 * Get start and end dates for data fetch
 * 🔧 CUSTOMIZE THIS: Change the number of days (max 7 days)
 * @returns {Object} Object with startTime and endTime ISO strings
 */
function getDateRange() {
  const now = new Date()
  const endTime = now // Current time
  const startTime = new Date(now)
  startTime.setDate(startTime.getDate() - 1) // Last 24 hours (change this: max 7 days)
  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString()
  }
}

/**
 * Fetch data from the API
 * 🔧 CUSTOMIZE THESE PARAMETERS FOR YOUR PRODUCT
 * @returns {Promise<Array>} Array of data objects
 */
async function fetchData() {
  const { startTime, endTime } = getDateRange()
  
  console.log(`Fetching data for period: ${startTime} to ${endTime}`)

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": "cpw-tracker.p.rapidapi.com",
      "x-rapidapi-key": API_KEY,
    },
    body: JSON.stringify({
      // 🔧 CHANGE THESE FOR YOUR USE CASE:
      entities: "financial custodians",    // ← What to track
      topic: "cyberattack",               // ← What topic
      startTime,
      endTime
    }),
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }

  const data = await response.json()
  const results = Array.isArray(data) ? data : []
  
  console.log(`Found ${results.length} results`)
  return results
}

/**
 * Save data to JSON file (optional - remove if you don't need it)
 * @param {Array} data - Array of data objects
 */
async function saveData(data) {
  const sorted = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  await mkdir("data", { recursive: true })
  await writeFile("data/events.json", JSON.stringify(sorted, null, 2))

  console.log(`Saved ${sorted.length} items to data/events.json`)
}

/**
 * Main update process
 */
async function updateData() {
  try {
    const data = await fetchData()
    
    await saveData(data)
    
    console.log("Update completed successfully")
  } catch (error) {
    console.error("Update failed:", error.message)
    process.exit(1)
  }
}

updateData()
