const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken"); // You need to import jwt.
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let database = null;

const initilizationDBAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at 3000");
    });
  } catch (e) {
    console.error(`DB server Error: ${e.message}`); // Use console.error for errors.
    process.exit(1);
  }
};

initilizationDBAndServer();

// Define jwt secret key (should be kept secret and not hard-coded).
const JWT_SECRET = "YOUR_SECRET_KEY_HERE";

const convertDBobjectToStateResponse = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDBobjectToDistrictResponse = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, JWT_SECRET, async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = ?;`;
  const dbUser = await database.get(selectUserQuery, [username]);
  if (!dbUser) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, JWT_SECRET);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// ... (Rest of your routes)

app.get("/states/", authenticateToken, async (request, response) => {
  const getStateQuery = `
        SELECT
         *
        FROM 
          state;`;
  const StateArray = await database.all(getStateQuery);
  const stateResult = StateArray.map((each) =>
    convertDBobjectToStateResponse(each)
  );
  response.send(stateResult);
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
  SELECT
   * 
  FROM
   state
  WHERE 
    state_id=${stateId};`;
  const state = await database.get(getStateQuery);
  const stateResult = convertDBobjectToStateResponse(state);
  response.send(stateResult);
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
  SELECT
   * 
  FROM
   district
  WHERE 
    district_id=${districtId};`;
    const district = await database.get(getDistrictQuery);
    const districtResult = convertDBobjectToDistrictResponse(district);
    response.send(districtResult);
  }
);

app.post("/districts/", authenticateToken, async (request, response) => {
  const stateAdd = request.body;
  const { districtName, stateId, cases, cured, active, deaths } = stateAdd;
  const Query = `
     INSERT INTO 
     district(
      district_name,
      state_id,
      cases,
      cured,
      active,
      deaths)
      VALUES
      (
          '${districtName}',
          ${stateId},
          ${cases},
          ${cured},
          ${active},
          ${deaths}
      );`;
  await database.run(Query);
  response.send("District Successfully Added");
});
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrict = `
  DELETE
  FROM
   district
  WHERE 
    district_id=${districtId};`;
    await database.run(deleteDistrict);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrict = `
  UPDATE 
    district
  SET   
    district_name ='${districtName}',
    state_id =  ${stateId},
    cases =  ${cases},
    cured =  ${cured},
    active =  ${active},
    deaths =  ${deaths}
  WHERE  district_id=${districtId}; `;
    await database.run(updateDistrict);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getstateReport = `
    SELECT
      SUM(cases) AS totalCases,
      SUM(cured) AS totalCured,
      SUM(active) AS totalActive,
      SUM(deaths) AS totalDeaths
    FROM district
    WHERE state_id=${stateId};`;

    try {
      const stats = await database.get(getstateReport);

      if (stats) {
        response.send(stats);
      } else {
        response.status(404).send("State not found");
      }
    } catch (error) {
      response.status(500).send("Internal Server Error");
    }
  }
);
module.exports = app;
