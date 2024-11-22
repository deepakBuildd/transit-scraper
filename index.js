const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const express = require("express");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class AstroSageScraper {
  constructor() {
    this.baseUrl = "https://www.astrosage.com/free/transit-today.asp";
  }

  // Latitude/Longitude conversion functions
  latLongToAstroFormat(lat, lon) {
    const latDeg = Math.abs(Math.floor(lat));
    const latMin = Math.round((Math.abs(lat) - latDeg) * 59);
    const latDirection = lat < 0 ? "S" : "N";
    const latAstro = `${latDeg}${latDirection}${latMin}`;

    const lonDeg = Math.abs(Math.floor(lon));
    const lonMin = Math.round((Math.abs(lon) - lonDeg) * 59);
    const lonDirection = lon < 0 ? "W" : "E";
    const lonAstro = `${lonDeg}${lonDirection}${lonMin}`;

    return { latAstro, lonAstro };
  }

  async handlePopups(driver) {
    const popupSelectors = [
      // Common popup selectors, adjust based on actual site
      "button.close-popup",
      'button[aria-label="Close"]',
      ".permission-popup .close",
      "#consent-popup .decline",
      'div[data-testid="close-button"]',
    ];

    for (const selector of popupSelectors) {
      try {
        const popupCloseButton = await driver.findElements(By.css(selector));
        if (popupCloseButton.length > 0) {
          await popupCloseButton[0].click();
          await driver.sleep(500); // Short wait after closing
        }
      } catch (error) {
        // Ignore if popup close fails
      }
    }
  }

  async scrapeTransitChart(birthDetails) {
    // Set up Chrome options
    const options = new chrome.Options();
    // Uncomment below if you want to run in headless mode
    // options.addArguments('--headless');

    // Create the WebDriver
    const driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();

    try {
      // Navigate to the page
      await driver.get(this.baseUrl);

      // Fill basic birth details
      await driver.findElement(By.name("name")).sendKeys(birthDetails.name);
      await driver.findElement(By.name("day")).sendKeys(birthDetails.day);
      await driver.findElement(By.name("month")).sendKeys(birthDetails.month);
      await driver.findElement(By.name("year")).sendKeys(birthDetails.year);
      await driver.findElement(By.name("hrs")).sendKeys(birthDetails.hours);
      await driver.findElement(By.name("min")).sendKeys(birthDetails.minutes);
      await driver.findElement(By.name("sec")).sendKeys(birthDetails.seconds);

      // Select sex
      const sexSelect = await driver.findElement(By.name("sex"));
      await sexSelect
        .findElement(By.xpath(`//option[text()="${birthDetails.sex}"]`))
        .click();

      // Fill place
      await driver.findElement(By.name("place")).sendKeys(birthDetails.place);

      // Open advanced settings
      const advancedButton = await driver.findElement(
        By.xpath(
          '//a[contains(@class, "btn") and contains(text(), "Advanced Settings")]'
        )
      );
      await advancedButton.click();

      await sleep(3000);
      await this.handlePopups(driver); // Add this line

      // Convert lat/lon
      const { latAstro, lonAstro } = this.latLongToAstroFormat(
        birthDetails.latitude,
        birthDetails.longitude
      );

      console.log({
        longdeg: latAstro.match(/\d+/)[0],
        longmin: latAstro.match(/\d+$/)[0],
        longEW: latAstro.includes("N") ? "E" : "W",
        latdeg: lonAstro.match(/\d+/)[0],
        latmin: lonAstro.match(/\d+$/)[0],
        latns: lonAstro.includes("E") ? "N" : "S",
      });

      // Fill advanced settings
      await driver
        .findElement(By.name("longdeg"))
        .sendKeys(latAstro.match(/\d+/)[0]);
      await driver
        .findElement(By.name("longmin"))
        .sendKeys(latAstro.match(/\d+$/)[0]);
      const longEWSelect = await driver.findElement(By.name("longew"));
      await longEWSelect
        .findElement(
          By.xpath(`//option[@value="${latAstro.includes("N") ? "E" : "W"}"]`)
        )
        .click();

      await driver
        .findElement(By.name("latdeg"))
        .sendKeys(lonAstro.match(/\d+/)[0]);
      await driver
        .findElement(By.name("latmin"))
        .sendKeys(lonAstro.match(/\d+$/)[0]);
      const latNSSelect = await driver.findElement(By.name("latns"));
      await latNSSelect
        .findElement(
          By.xpath(`//option[text()="${lonAstro.includes("E") ? "N" : "S"}"]`)
        )
        .click();

      // Set timezone (simplistic approach)
      await driver.findElement(By.name("timezone")).sendKeys("5.5");

      console.log("Form filled");

      // Submit the form
      const submitButton = await driver.findElement(
        By.xpath('//input[@type="submit" and @value="SUBMIT"]')
      );
      await submitButton.click();

      console.log("Form submitted");

      // After form submission and waiting for page load
      await driver.wait(
        until.elementLocated(By.css(".card.padding-all.hdg-content")),
        10000
      );

      // Find all h2 tags within the specified div
      const planetHouseElements = await driver.findElements(
        By.css(".card.padding-all.hdg-content h2")
      );

      // Extract text from these elements
      const planetHouseInfo = [];
      for (const element of planetHouseElements) {
        const text = await element.getText();
        planetHouseInfo.push(text.trim());
      }

      console.log("Planet and House Information:", planetHouseInfo);

      const housePlanetsMap = planetHouseInfo.reduce((map, info) => {
        const planet = info.split(" ")[0];
        const house = info.match(/(\d+)\s*th\s*House/)[1];

        if (!map[house]) {
          map[house] = [];
        }
        map[house].push(planet);

        return map;
      }, {});

      console.log("House to Planets Map:", housePlanetsMap);

      return planetHouseInfo;
    } catch (error) {
      console.error("Scraping error:", error);
      throw error;
    } finally {
      // Close the browser
      await driver.quit();
    }
  }
}

const app = express();
const PORT = 4000;

app.get("/scraper", async (req, res) => {
  try {
    const { day, month, year, hour, min, lat, lon } = req.query;

    // Validate required parameters
    if (!day || !month || !year || !hour || !min || !lat || !lon) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const scraper = new AstroSageScraper();

    const birthDetails = {
      name: "API User",
      day,
      month,
      year,
      hours: hour,
      minutes: min,
      seconds: "00",
      sex: "Male", // Default, could be passed as parameter
      place: "API Location",
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
    };

    const planetHouseInfo = await scraper.scrapeTransitChart(birthDetails);

    const housePlanetsMap = planetHouseInfo.reduce((map, info) => {
      const planet = info.split(" ")[0];
      const house = info.match(/(\d+)\s*th\s*House/)[1];

      if (!map[house]) {
        map[house] = [];
      }
      map[house].push(planet);

      return map;
    }, {});

    res.json({
      input: birthDetails,
      housePlanets: housePlanetsMap,
      rawPlanetInfo: planetHouseInfo,
    });
  } catch (error) {
    console.error("API Error:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
