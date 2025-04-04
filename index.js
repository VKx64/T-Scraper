import PocketBase from 'pocketbase';
import { chromium } from 'playwright';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  try {
    // Initialize the Pocketbase client
    const pb = new PocketBase('https://dbfleet.07130116.xyz');

    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb2xsZWN0aW9uSWQiOiJwYmNfMzE0MjYzNTgyMyIsImV4cCI6MTc0NjM1ODE1MiwiaWQiOiIzN3Zqc2JrMW02M253MWMiLCJyZWZyZXNoYWJsZSI6ZmFsc2UsInR5cGUiOiJhdXRoIn0.c8ceeVZZFjj0KVKSHfGCWGcIS__SL5gKtY0plsdVyBI";

    // Set the authentication token using the proper method
    pb.authStore.save(token, null);

    console.log("Launching browser...");
    // Launch the browser with increased timeouts
    const browser = await chromium.launch({
      headless: false,
      timeout: 60000 // Increase launch timeout to 60 seconds
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to website...");
    // Increase page load timeout to 30 seconds
    await page.goto("https://en.aika168.com/", {
      timeout: 30000,
      waitUntil: "domcontentloaded" // Less strict wait condition
    });

    console.log("Waiting for login iframe...");
    const iframeElement = await page.waitForSelector("iframe#ifm", { timeout: 30000 });
    const iframe = await iframeElement.contentFrame();

    console.log("Logging in...");
    // Login (with increased timeouts)
    await iframe.waitForSelector("#productMenuGrup a.bai.b", { timeout: 30000 });
    await iframe.click("#productMenuGrup a.bai.b"); // Click the "ID No." tab to switch to IMEI login

    // Add a short delay after clicking to ensure the form is ready
    await delay(2000);

    await iframe.waitForSelector("#txtImeiNo", { timeout: 30000 });
    await iframe.waitForSelector("#txtImeiPassword", { timeout: 30000 });
    await iframe.fill("#txtImeiNo", "9176231065");
    await iframe.fill("#txtImeiPassword", "pelias123");
    await iframe.waitForSelector("#btnLoginImei", { timeout: 30000 });
    await iframe.click("#btnLoginImei");

    // Add a delay after login to ensure the page loads properly
    await delay(5000);

    // The provided gps value
    const providedGpsValue = 'rt7y94h9nblkx63'; // Replace with the actual gps value you want to match
    let isRunning = true;

    // Set up handling for stopping the loop
    process.on('SIGINT', async () => {
      console.log('\nStopping the script...');
      isRunning = false;
      await browser.close();
      rl.close();
      process.exit(0);
    });

    console.log('Login successful! Starting data fetch loop. Press Ctrl+C to stop.');

    // Start the loop
    while (isRunning) {
      try {
        console.log("Fetching device data...");
        // Fetch device data from the iframe (with increased timeouts)
        const deviceIframeElement = await page.waitForSelector("iframe#pageShowFrame_Map", { timeout: 30000 });
        const deviceIframe = await deviceIframeElement.contentFrame();
        await deviceIframe.waitForSelector("tr.divDeviceTab", { timeout: 30000 });

        const rows = await deviceIframe.$$eval("tr.divDeviceTab", (rows) => {
          return rows.map((row) => {
            const cells = row.querySelectorAll("td");
            return {
              minivanNo: cells[0].innerText.trim(),
              countryCode: cells[1].innerText.trim(),
              direction: cells[7].innerText.trim(),
              status: cells[9].innerText.trim(),
              latitude: parseFloat(cells[4].innerText.trim()),
              longitude: parseFloat(cells[5].innerText.trim()),
              speed: parseFloat(cells[6].innerText.trim()),
              total_mileage: parseFloat(cells[8].innerText.trim()),
            };
          });
        });

        if (rows.length === 0) {
          console.log("No device data found. Retrying...");
          await delay(5000);
          continue;
        }

        console.log(`Found ${rows.length} device(s). Updating database...`);

        try {
          // Update the database with the fetched data
          const fleetStatisticsRecord = await pb.collection('fleet_statistics').getFirstListItem(`gps.id = "${providedGpsValue}"`);

          if (fleetStatisticsRecord) {
            const updatedFleetStatistics = {
              direction: rows[0].direction,
              status: rows[0].status,
              latitude: rows[0].latitude,
              longitude: rows[0].longitude,
              speed: rows[0].speed,
              total_mileage: rows[0].total_mileage,
              updated: new Date().toISOString(),
              gps: fleetStatisticsRecord.gps.id,
            };

            const updatedRecord = await pb.collection('fleet_statistics').update(fleetStatisticsRecord.id, updatedFleetStatistics);
            const now = new Date().toLocaleTimeString();
            console.log(`[${now}] Fleet Statistics updated successfully`);
          } else {
            console.log('No matching fleet_statistics record found for the provided GPS ID.');
          }
        } catch (error) {
          console.error("Error updating fleet statistics:", error.message);
        }

        // Wait for 5 seconds before the next iteration
        console.log("Waiting 5 seconds before next update...");
        await delay(5000);
      } catch (error) {
        console.error("Error in the main loop:", error.message);

        // If there's an error, wait a bit longer before trying again
        console.log("Waiting 15 seconds before retrying...");
        await delay(15000);
      }
    }
  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
})();
