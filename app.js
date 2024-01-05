//jshint esversion:6
const mongoose = require("mongoose");
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const session = require('express-session');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const pageSize = 100; // Set the number of items per page

/*This requires the npm package called the mongoose that as the driver 
or the intration of the mongoDB with node js.*/

const app = express();
const cors = require('cors'); // Import the cors middleware
const { checkServerIdentity } = require('tls');
const { Z_UNKNOWN } = require("zlib");
const { fail } = require("assert");
const { ObjectID, ObjectId } = require("mongodb");
const { use } = require("passport");
const { get } = require("http");


//Include the ejs and the css files with the backend code
app.use(cors());
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static("public/images"));
const success = '<div class="alert alert-success"><strong>Success!</strong> Updated Successfully.</div>'
const failure = '<div class="alert alert-danger"><strong>Failure!</strong> Updation Failed.</div>'

/*This helps in connecting to the mongoDB server called the userDB, 
if doesn't exits then it creates a new database. The end section is added to avoid 
the deprication error created, beacuse the current version is outdated*/
mongoose.connect("mongodb://localhost:27017/userDB", { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set("useCreateIndex", true);
mongoose.set('useFindAndModify', false);

/*This step is used similar to the creation in the case of the SQL languages,
 but the difference here is thsi schema or the patterm=n can be use for creation 
 numerous tables or in this case a collection*/

 const transactionSchema = new mongoose.Schema({
  transactionID: String
});

 const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String
});

const agentSchema = new mongoose.Schema({
  username: String,
  phonenumber: String,
  agentcode: {
    type: String,
    index: true
  },
});

const execuitiveSchema = new mongoose.Schema({
  username: String,
  phonenumber: String,
  execuitivecode: {
    type: String,
    index: true
  },
});

const seasonSchema = new mongoose.Schema({
  seasonnumber: Number,
  amount: Number,
  months: Number,
  startdate: String
});

const schemuserSchema = new mongoose.Schema({
  registrationID: {
    type: String,
    index: true
  },
  username: String,
  phonenumber1: String,
  phonenumber2: String,
  transactionArray: Array,
  lastdateArray: Array,
  paymentdateArray: Array,
  unpaidArray: Array,
  paidArray: Array,
  status: String,
  statusdate: String,
  datecreated: String,
  datelast: String,
  seasonnumber: Number,
  agentcode: String,
  execuitivecode: String,
  usercreatedID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'userSchema'
  },
  userlastID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'userSchema'
  }
});

/*This step is used for the creation of the new collection. 
The individual elements are given in the singular form*/
const User = new mongoose.model("User", userSchema);
const SchemUser = new mongoose.model("SchemUser", schemuserSchema);
const Agent = new mongoose.model("Agent", agentSchema);
const Execuitive = new mongoose.model("Execuitive", execuitiveSchema);
const Season = new mongoose.model("Season", seasonSchema);
const Transaction = new mongoose.model("Transaction", transactionSchema);

// Set up session middleware
app.use(session({
  secret: 'your-secret-key', // Change this to a secure random string
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Parse incoming requests with JSON payloads
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware to check if the user is logged in and is an admin
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role=='admin') {
    return next();
  } else {
    // Redirect to the login page if not authenticated
    res.redirect('/login');
  }
};

// Middleware to check if the user is logged in
const Authenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  } else {
    // Redirect to the login page if not authenticated
    res.redirect('/login');
  }
};

// Check if the transaction ID array is unique as per the transaction collection
async function uniqueTransactionID(transactionArray){
  let length = transactionArray.length;
  let transaction = await Transaction.find({});
  let size = 0;
  if(transaction!=null){
    size = transaction.length;
  }
  for(let i=0;i<length;i=i+1){
    for(let j=0;j<length;j=j+1){
      if(i!=j && transactionArray[i]!='' && transactionArray[i]==transactionArray[j]){
        return false;
      }
    }
  }
  for(let i=0;i<length;i=i+1){
    if(transactionArray[i]!=''){
      for(let j=0;j<size;j=j+1){
        if(transactionArray[i]==transaction[j].transactionID){
          return false;
        }
      }
    }
  }
  return true;
};

// Create a new transaction ID in the transaction collection
async function insertTransactionID(transactionArray){
  let length = transactionArray.length;
  for(let i=0;i<length;i=i+1){
    if(transactionArray[i]!=''){
      await Transaction.insertMany([{transactionID: transactionArray[i]}]);
    }
  }
};

// Find the unpaid money for the given user
function unpaidMoneyDate(user, date){
  let size = user.paidArray.length;
  let unpaid = 0;
  for(let j=0;j<size;j=j+1){
    let value1 = user.lastdateArray[j].split("-");
    let value2 = date.split("-");
    let a = [value1[2].padStart(2, '0'), value1[1].padStart(2, '0'), value1[0].padStart(2, '0')];
    let b = [value2[0].padStart(2, '0'), value2[1].padStart(2, '0'), value2[2].padStart(2, '0')];
    if(a<=b){
      unpaid += user.unpaidArray[j];
    }
    else{
      unpaid += user.unpaidArray[j];
      break;
    }
  }
  return unpaid;
};

// Get the current time
function getTime(){
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const day = currentDate.getDate();
  return [year, month, day];
};

// Create a csv file from the object (as the parameter) which includes the pending amount
function arrayToCsv(arrayData) {
  const csvFilePath = "output.csv";
  const csvHeader = ["registrationID", "username", "phonenumber1",
   "phonenumber2", "agentcode", "execuitivecode", "pending"];
  const csvWriter = createCsvWriter({
    path: csvFilePath,
    header: csvHeader.map(header => ({ id: header, title: header }))
  });
  return csvWriter.writeRecords(arrayData);
};

// Create a csv file from the object provided as the parameter
function arrayToCsvSubscriber(arrayData, months) {
  const csvFilePath = "output.csv";
  var csvHeader = ["username", "phonenumber1", "phonenumber2",
  "registrationID", "status", "statusdate", "seasonnumber",
  "agentcode", "execuitivecode"];
  for(let i=1;i<=months;i++){
    csvHeader.push(String(i)+" Payment Date");
    csvHeader.push(String(i)+" Transaction ID");
    csvHeader.push(String(i)+" Paid");
  }
  const csvWriter = createCsvWriter({
    path: csvFilePath,
    header: csvHeader.map(header => ({ id: header, title: header }))
  });
  return csvWriter.writeRecords(arrayData);
};

// Get the graph data (pie chart and the point graph) for the given set of users who belong to the given season 
async function graphData(seasonnumber) {
  const paid = await SchemUser.aggregate([
    {$match: {seasonnumber: seasonnumber}},
    {$unwind: '$paidArray'},
    {$group: 
      {_id: '$agentcode', 
      paid: { $sum: '$paidArray'}
    }}
  ]).sort({_id: 1});
  const unpaid = await SchemUser.aggregate([
    {$match: {seasonnumber: seasonnumber}},
    {$unwind: '$unpaidArray'},
    {$group: 
      {_id: '$agentcode', 
      unpaid: { $sum: '$unpaidArray'}
    }}
  ]).sort({_id: 1});
  const count = await SchemUser.aggregate([
    {$match: {seasonnumber: seasonnumber}},
    {$group: 
      {_id: '$agentcode', 
      count: { $sum: 1}
    }}
  ]).sort({_id: 1});

  var result = {paid: 0, unpaid: 0, length: 0, size: 0,
    xValues: [], dataset1: [], dataset2: []
  };
  result.length = await SchemUser.countDocuments({seasonnumber: seasonnumber});
  result.size = paid.length - 1;

  // Find all the agent codes of the scheme users and then find the amount of money that each agent has brought
  for(let i=0;i<=result.size;i=i+1){
    if(paid[i]._id!=null){
      result.xValues.push(paid[i]._id);
      result.dataset1.push(paid[i].paid);
      result.paid += paid[i].paid;
    }
  }
  for(let i=0;i<=result.size;i=i+1){
    if(unpaid[i]._id!=null){
      result.unpaid += unpaid[i].unpaid;
    }
  }
  for(let i=0;i<=result.size;i=i+1){
    if(count[i]._id!=null){
      result.dataset2.push(count[i].count);
    }
  }
  return result;
};


// Display the dashboard after acquiring the graph data
app.get('/', Authenticated, async (req, res) => {
  const seasons = await Season.find({});
  const result = await graphData(req.session.user.seasonnumber);
  res.render("src/index", {username:req.session.user.username, role: req.session.user.role,
    paid: result.paid, unpaid: result.unpaid, length: result.length, seasons: seasons, seasonnumber: req.session.user.seasonnumber,
    dataset1: result.dataset1, dataset2: result.dataset2, xValues: result.xValues, seasonlength: req.session.user.seasonlength});
});


// Take the season number as the input from the user
app.post('/season', Authenticated, async (req, res) => {
  req.session.user.seasonnumber = Number(req.body.seasonnumber);
  res.redirect("/");
});


// Upload the csv files of the agent data
app.get("/uploadAgent", Authenticated, async (req, res) => {
  const csvFilePath = 'CSVFiles/AgentDataCSV.csv';
  fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', async (row) => {
    const keys = Object.keys(row);
    await Agent.insertMany([row]);
  })
  .on('end', () => {
    console.log('CSV file successfully processed');
    res.redirect("/");
  });
});
// Upload the csv files of the executive data
app.get("/uploadExecuitive", Authenticated, async (req, res) => {
  const csvFilePath = 'CSVFiles/ExecutiveDataCSV.csv';
  fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', async (row) => {
    const keys = Object.keys(row);
    await Execuitive.insertMany([row]);
  })
  .on('end', () => {
    console.log('CSV file successfully processed');
    res.redirect("/");
  });
});
// Upload the csv files of the scheme member data
app.get("/uploadMember", isAuthenticated, async (req, res) => {
  const csvFilePath = 'CSVFiles/MembershipDataCSV.csv';
  let date = getTime();
  date = String(date[2]).padStart(2, '0')+"-"+String(date[1]).padStart(2, '0')+"-"+String(date[0]).padStart(2, '0');
  let index = 1;
  fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', async (row) => {
    const keys = Object.keys(row);
    let data = {
      registrationID: '',
      username: '',
      phonenumber1: '',
      phonenumber2: '',
      transactionArray: '',
      lastdateArray: '',
      paymentdateArray: '',
      unpaidArray: '',
      paidArray: '',
      status: '',
      statusdate: '',
      datecreated: '',
      datelast: '',
      seasonnumber: '',
      agentcode: null,
      execuitivecode: null,
      usercreatedID: null,
      userlastID: null
    };
    data.registrationID = row.registrationID;
    data.username = row.username;
    data.phonenumber1 = row.phonenumber1;
    data.phonenumber2 = row.phonenumber2;
    if(row.execuitivecode!="")
      data.execuitivecode = row.execuitivecode;
    if(row.agentcode!="")
      data.agentcode = row.agentcode;
    data.status = row.status;
    data.statusdate = date;
    data.datecreated = date;
    data.datelast = date;
    data.usercreatedID = req.session.user._id;
    data.userlastID = req.session.user._id;
    data.seasonnumber = row.seasonnumber;
    let length = (keys.length - 8)/3;
    data.paidArray = [];
    data.unpaidArray = [];
    data.transactionArray = [];
    data.lastdateArray = [];
    data.paymentdateArray = [];
    let season = await Season.findOne({seasonnumber: row.seasonnumber});
    let amount = season.amount;
    let startdate = season.startdate;
    for(let i=1;i<=length;i=i+1){
      string = startdate.split("-");
      string = string[0]+"-"+String((Number(string[1])-1+i-1)%12+1)+"-"+String(Number(string[2])+Math.ceil((Number(string[1])+i-1)/12)-1);
      data.lastdateArray.push(string);
      data.paymentdateArray.push(row[`${i}th Payment Date`]);
      if(row[`${i}th Amount`]=='' && row.status=='ACTIVE'){
        data.unpaidArray.push(amount);
        data.paidArray.push(0);
      }
      else{
        data.unpaidArray.push(0);
        data.paidArray.push(Number(row[`${i}th Amount`]));
      }
      if(row[`${1}st Transaction id`]!='')
        data.transactionArray.push(row[`${i}th Transaction id`]);
      else
        data.transactionArray.push(null);
    }
    let valid = await uniqueTransactionID(data.transactionArray);
    if(valid){
      await insertTransactionID(data.transactionArray);
      await SchemUser.insertMany([data]);
    }
    else{
      console.log("Entry ", index, " skipped");
    }
    index = index + 1
  })
  .on('end', async () => {
    console.log('CSV file successfully processed');
    res.redirect("/");
  });
});


// Download the csv file which includes the pending the amount
app.post('/pendingDownload', isAuthenticated, async (req, res) => {
  const season = await Season.find({});
  const size = season.length;
  var temp = getTime();
  var date = String(temp[0]).padStart(2, '0')+"-"+String(temp[1]).padStart(2, '0')+"-"+String(temp[2]).padStart(2, '0');
  if(req.body.date!=''){
    date = req.body.date
  }
  var search = [];
  search.push({ registrationID: { $regex: req.body.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: req.body.username}, seasonnumber: req.session.user.seasonnumber });
  if(req.body.phonenumber!=''){
    search.push({ $or: [{phonenumber1: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber },
      {phonenumber2: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber }
    ]});
  }
  if(req.body.agentcode!=''){
    search.push({ agentcode: { $regex: req.body.agentcode}, seasonnumber: req.session.user.seasonnumber });
  }
  if(req.body.execuitivecode!=''){
    search.push({ execuitivecode: { $regex: req.body.execuitivecode}, seasonnumber: req.session.user.seasonnumber });
  }
  var user = await SchemUser.find({$and: search}).sort({ registrationID: 1 });
  var result = []
  var length = 0
  if(user!=null){
    length = user.length
  }
  for(let i=0;i<length;i=i+1){
    let unpaid = unpaidMoneyDate(user[i], date);
    if(unpaid!=0){
      let temp = {
        registrationID: user[i].registrationID,
        username: user[i].username,
        phonenumber1: user[i].phonenumber1,
        phonenumber2: user[i].phonenumber2,
        agentcode: user[i].agentcode,
        execuitivecode: user[i].execuitivecode,
        pending: unpaid
      };
      result.push(temp)
    }
  }
  var temp = {
    registrationID: 'Last Date',
    username: date,
    phonenumber1: '',
    phonenumber2: '',
    agentcode: '',
    execuitivecode: '',
    pending: ''
  };
  result.push(temp)
  try {
    await arrayToCsv(result);
    const fileStream = fs.createReadStream('output.csv');
    const csvContent = fs.readFileSync('output.csv', 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error writing CSV file:', error);
    res.redirect("/report");
    res.status(500).send('Internal Server Error');
  }
});
// Download the csv file which contains the data of the subscribers
app.post('/subscriberDownload', isAuthenticated, async (req, res) => {
  const season = await Season.find({});
  const size = season.length;
  var search = [];
  search.push({ registrationID: { $regex: req.body.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: req.body.username}, seasonnumber: req.session.user.seasonnumber });
  if(req.body.phonenumber!=''){
    search.push({ $or: [{phonenumber1: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber },
      {phonenumber2: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber }
    ]});
  }
  if(req.body.agentcode!=''){
    search.push({ agentcode: { $regex: req.body.agentcode}, seasonnumber: req.session.user.seasonnumber });
  }
  if(req.body.execuitivecode!=''){
    search.push({ execuitivecode: { $regex: req.body.execuitivecode}, seasonnumber: req.session.user.seasonnumber });
  }
  search.push({ status: req.body.status, seasonnumber: req.session.user.seasonnumber });
  var user = await SchemUser.find({$and: search}).select("username phonenumber1 phonenumber2 registrationID status statusdate seasonnumber agentcode execuitivecode transactionArray paymentdateArray paidArray").sort({ registrationID: 1 });
  var length = 0;
  if(user!=null) 
    length = user.length;
  var result = [];
  var months = 0;
  for(let i=0;i<length;i++){
    var object = {};
    object["username"]=user[i].username;
    object["phonenumber1"]=user[i].phonenumber1;
    object["phonenumber2"]=user[i].phonenumber2;
    object["registrationID"]=user[i].registrationID;
    object["status"]=user[i].status;
    object["statusdate"]=user[i].statusdate;
    object["seasonnumber"]=user[i].seasonnumber;
    object["agentcode"]=user[i].agentcode;
    object["execuitivecode"]=user[i].execuitivecode;
    months=user[i].transactionArray.length;
    for(let j=1;j<=months;j++){
      object[String(j)+" Payment Date"]=user[i].paymentdateArray[j-1];
      object[String(j)+" Transaction ID"]=user[i].transactionArray[j-1];
      object[String(j)+" Paid"]='';
      if(user[i].paidArray[j-1]!=0)
        object[String(j)+" Paid"]=user[i].paidArray[j-1];
    }
    result.push(object);
  }
  try {
    await arrayToCsvSubscriber(result, months);
    const fileStream = fs.createReadStream('output.csv');
    const csvContent = fs.readFileSync('output.csv', 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error writing CSV file:', error);
    res.redirect("/report");
    res.status(500).send('Internal Server Error');
  }
});


// Display the scheme subscribers as a table 
app.get('/view', Authenticated, async (req, res) => {
  var condition = {
    username: '',
    registrationID: '',
    phonenumber: '',
    status: 'ACTIVE',
    agentcode: '',
    execuitivecode: ''
  };
  const season =  await Season.find({});
  const page = 1;
  const user = await SchemUser.aggregate([
    { $match: {seasonnumber: req.session.user.seasonnumber, status: "ACTIVE"} },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
  ]).sort({ registrationID: 1 });
  var message = "<div></div>"
  res.render("src/Tables/view", {username:req.session.user.username, 
    role: req.session.user.role, user: user, condition: condition, 
    seasonnumber: req.session.user.seasonnumber, size: season.length, message: message, page: page});
});
// Display the scheme subscribers as a table along with the success message
app.get('/viewSuccess', Authenticated, async (req, res) => {
  var condition = {
    username: '',
    registrationID: '',
    phonenumber: '',
    status: 'ACTIVE',
    agentcode: '',
    execuitivecode: ''
  };
  const season =  await Season.find({});
  const page = 1;
  const user = await SchemUser.aggregate([
    { $match: {seasonnumber: req.session.user.seasonnumber, status: "ACTIVE"} },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
  ]).sort({ registrationID: 1 });
  var message = success;
  res.render("src/Tables/view", {username:req.session.user.username, 
    role: req.session.user.role, user: user, condition: condition, 
    seasonnumber: req.session.user.seasonnumber, size: season.length, message: message, page: page});
});
// Display the scheme subscribers as a table along with the failure message
app.get('/viewFailure', Authenticated, async (req, res) => {
  var condition = {
    username: '',
    registrationID: '',
    phonenumber: '',
    status: 'ACTIVE',
    agentcode: '',
    execuitivecode: ''
  };
  const season =  await Season.find({});
  const page = 1;
  const user = await SchemUser.aggregate([
    { $match: {seasonnumber: req.session.user.seasonnumber, status: "ACTIVE"} },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
  ]).sort({ registrationID: 1 });
  var message = failure;
  res.render("src/Tables/view", {username:req.session.user.username, 
    role: req.session.user.role, user: user, condition: condition, 
    seasonnumber: req.session.user.seasonnumber, size: season.length, message: message, page: page});
});


// Display the scheme subscribers along with the pending information as a table 
app.get('/report', Authenticated, async (req, res) => {
  var temp = getTime();
  var date = String(temp[0]).padStart(2, '0')+"-"+String(temp[1]).padStart(2, '0')+"-"+String(temp[2]).padStart(2, '0');
  var condition = {
    date: date,
    username: '',
    registrationID: '',
    agentcode: '',
    phonenumber: '',
    execuitivecode: ''
  };
  const season = await Season.find({});
  const size = season.length;
  var search = [];
  search.push({ registrationID: { $regex: condition.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: condition.username}, seasonnumber: req.session.user.seasonnumber });
  const page = 1;
  var user = await SchemUser.find({$and: search}).sort({registrationID: 1});
  var result = []
  var pending = []
  var length = 0
  if(user!=null){
    length = user.length
  }
  for(let i=0;i<length;i=i+1){
    let unpaid = unpaidMoneyDate(user[i], date);
    if(unpaid!=0){
      result.push(user[i])
      pending.push(unpaid)
    }
  }
  const startIndex = (page-1)*pageSize;
  result = result.slice(startIndex, startIndex+pageSize);
  pending = pending.slice(startIndex, startIndex+pageSize);
  res.render("src/Tables/report", {username:req.session.user.username, role: req.session.user.role, user: result, seasonnumber: req.session.user.seasonnumber,
    message: "<div></div>", pending: pending, condition: condition, size: size, page: page});
});
// Display the scheme subscribers along with the pending information as a table with the success information
app.get('/reportSuccess', Authenticated, async (req, res) => {
  var temp = getTime();
  var date = String(temp[0]).padStart(2, '0')+"-"+String(temp[1]).padStart(2, '0')+"-"+String(temp[2]).padStart(2, '0');
  var condition = {
    date: date,
    username: '',
    registrationID: '',
    agentcode: '',
    phonenumber: '',
    execuitivecode: ''
  };
  const season = await Season.find({});
  const size = season.length;
  var search = [];
  search.push({ registrationID: { $regex: condition.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: condition.username}, seasonnumber: req.session.user.seasonnumber });
  const page = 1;
  var user = await SchemUser.find({$and: search}).sort({registrationID: 1});
  var result = []
  var pending = []
  var length = 0
  if(user!=null){
    length = user.length
  }
  for(let i=0;i<length;i=i+1){
    let unpaid = unpaidMoneyDate(user[i], date);
    if(unpaid!=0){
      result.push(user[i])
      pending.push(unpaid)
    }
  }
  const startIndex = (page-1)*pageSize;
  result = result.slice(startIndex, startIndex+pageSize);
  pending = pending.slice(startIndex, startIndex+pageSize);
  res.render("src/Tables/report", {username:req.session.user.username, role: req.session.user.role, user: result, seasonnumber: req.session.user.seasonnumber,
    message: success, pending: pending, condition: condition, size: size, page: page});
});
// Display the scheme subscribers along with the pending information as a table with the failure information
app.get('/reportFailure', Authenticated, async (req, res) => {
  var temp = getTime();
  var date = String(temp[0]).padStart(2, '0')+"-"+String(temp[1]).padStart(2, '0')+"-"+String(temp[2]).padStart(2, '0');
  var condition = {
    date: date,
    username: '',
    registrationID: '',
    agentcode: '',
    phonenumber: '',
    execuitivecode: ''
  };
  const season = await Season.find({});
  const size = season.length;
  var search = [];
  search.push({ registrationID: { $regex: condition.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: condition.username}, seasonnumber: req.session.user.seasonnumber });
  const page = 1;
  var user = await SchemUser.find({$and: search}).sort({registrationID: 1});
  var result = []
  var pending = []
  var length = 0
  if(user!=null){
    length = user.length
  }
  for(let i=0;i<length;i=i+1){
    let unpaid = unpaidMoneyDate(user[i], date);
    if(unpaid!=0){
      result.push(user[i])
      pending.push(unpaid)
    }
  }
  const startIndex = (page-1)*pageSize;
  result = result.slice(startIndex, startIndex+pageSize);
  pending = pending.slice(startIndex, startIndex+pageSize);
  res.render("src/Tables/report", {username:req.session.user.username, role: req.session.user.role, user: result, seasonnumber: req.session.user.seasonnumber,
    message: failure, pending: pending, condition: condition, size: size, page: page});
});


// Display the agent information as a table
app.get('/agent', Authenticated, async (req, res) => {
  const agent = await Agent.find({}).sort({ agentcode: 1 });
  var message = "<div></div>"
  res.render("src/Tables/agent", {username:req.session.user.username, role: req.session.user.role, agent: agent, message: message});
});
// Display the agent information as a table along with success message
app.get('/agentSuccess', Authenticated, async (req, res) => {
  const agent = await Agent.find({}).sort({ agentcode: 1 });
  var message = success
  res.render("src/Tables/agent", {username:req.session.user.username, role: req.session.user.role, agent: agent, message: message});
});
// Display the agent information as a table along with failure message
app.get('/agentFailure', Authenticated, async (req, res) => {
  const agent = await Agent.find({}).sort({ agentcode: 1 });
  var message = failure
  res.render("src/Tables/agent", {username:req.session.user.username, role: req.session.user.role, agent: agent, message: message});
});


// Display the executive information as a table
app.get('/execuitive', Authenticated, async (req, res) => {
  const execuitive = await Execuitive.find({}).sort({ execuitivecode: 1 });
  var message = "<div></div>"
  res.render("src/Tables/execuitive", {username:req.session.user.username, role: req.session.user.role, execuitive: execuitive, message: message});
});
// Display the executive information as a table along with success message
app.get('/execuitiveSuccess', Authenticated, async (req, res) => {
  const execuitive = await Execuitive.find({}).sort({ execuitivecode: 1 });
  var message = success
  res.render("src/Tables/execuitive", {username:req.session.user.username, role: req.session.user.role, execuitive: execuitive, message: message});
});
// Display the executive information as a table along with failure message
app.get('/execuitiveFailure', Authenticated, async (req, res) => {
  const execuitive = await Execuitive.find({}).sort({ execuitivecode: 1 });
  var message = failure
  res.render("src/Tables/execuitive", {username:req.session.user.username, role: req.session.user.role, execuitive: execuitive, message: message});
});


// Display filtered the scheme user data
app.post('/view', Authenticated, async (req, res) => {
  var condition = {
    username: req.body.username,
    registrationID: req.body.registrationID,
    phonenumber: req.body.phonenumber,
    status: req.body.status,
    agentcode: req.body.agentcode,
    execuitivecode: req.body.execuitivecode
  };
  console.log(req.body.page);
  var search = [];
  search.push({ registrationID: { $regex: req.body.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: req.body.username}, seasonnumber: req.session.user.seasonnumber });
  if(req.body.phonenumber!=''){
    search.push({ $or: [{phonenumber1: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber },
      {phonenumber2: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber }
    ]});
  }
  if(req.body.agentcode!=''){
    search.push({ agentcode: { $regex: req.body.agentcode}, seasonnumber: req.session.user.seasonnumber });
  }
  if(req.body.execuitivecode!=''){
    search.push({ execuitivecode: { $regex: req.body.execuitivecode}, seasonnumber: req.session.user.seasonnumber });
  }
  search.push({ status: req.body.status, seasonnumber: req.session.user.seasonnumber });
  const page = Number(req.body.page);
  const user = await SchemUser.aggregate([
    { $match: {$and: search} },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
  ]).sort({ registrationID: 1 });
  const season = await Season.find({});
  res.render("src/Tables/view", {username:req.session.user.username, 
    role: req.session.user.role, user: user, seasonnumber: req.session.user.seasonnumber, 
    condition: condition, size: season.length, message: "<div></div>", page: page});
});
app.post('/viewPrev', Authenticated, async (req, res) => {
  var condition = {
    username: req.body.username,
    registrationID: req.body.registrationID,
    phonenumber: req.body.phonenumber,
    status: req.body.status,
    agentcode: req.body.agentcode,
    execuitivecode: req.body.execuitivecode
  };
  console.log(req.body.page);
  var search = [];
  search.push({ registrationID: { $regex: req.body.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: req.body.username}, seasonnumber: req.session.user.seasonnumber });
  if(req.body.phonenumber!=''){
    search.push({ $or: [{phonenumber1: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber },
      {phonenumber2: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber }
    ]});
  }
  if(req.body.agentcode!=''){
    search.push({ agentcode: { $regex: req.body.agentcode}, seasonnumber: req.session.user.seasonnumber });
  }
  if(req.body.execuitivecode!=''){
    search.push({ execuitivecode: { $regex: req.body.execuitivecode}, seasonnumber: req.session.user.seasonnumber });
  }
  search.push({ status: req.body.status, seasonnumber: req.session.user.seasonnumber });
  const page = Number(req.body.page)-1;
  const user = await SchemUser.aggregate([
    { $match: {$and: search} },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
  ]).sort({ registrationID: 1 });
  const season = await Season.find({});
  res.render("src/Tables/view", {username:req.session.user.username, 
    role: req.session.user.role, user: user, seasonnumber: req.session.user.seasonnumber, 
    condition: condition, size: season.length, message: "<div></div>", page: page});
});
app.post('/viewNext', Authenticated, async (req, res) => {
  var condition = {
    username: req.body.username,
    registrationID: req.body.registrationID,
    phonenumber: req.body.phonenumber,
    status: req.body.status,
    agentcode: req.body.agentcode,
    execuitivecode: req.body.execuitivecode
  };
  console.log(req.body.page);
  var search = [];
  search.push({ registrationID: { $regex: req.body.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: req.body.username}, seasonnumber: req.session.user.seasonnumber });
  if(req.body.phonenumber!=''){
    search.push({ $or: [{phonenumber1: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber },
      {phonenumber2: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber }
    ]});
  }
  if(req.body.agentcode!=''){
    search.push({ agentcode: { $regex: req.body.agentcode}, seasonnumber: req.session.user.seasonnumber });
  }
  if(req.body.execuitivecode!=''){
    search.push({ execuitivecode: { $regex: req.body.execuitivecode}, seasonnumber: req.session.user.seasonnumber });
  }
  search.push({ status: req.body.status, seasonnumber: req.session.user.seasonnumber });
  const page = Number(req.body.page)+1;
  const user = await SchemUser.aggregate([
    { $match: {$and: search} },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
  ]).sort({ registrationID: 1 });
  const season = await Season.find({});
  res.render("src/Tables/view", {username:req.session.user.username, 
    role: req.session.user.role, user: user, seasonnumber: req.session.user.seasonnumber, 
    condition: condition, size: season.length, message: "<div></div>", page: page});
});
// Display filtered the scheme user including the pending amount data
app.post('/report', Authenticated, async (req, res) => {
  var condition = {
    date: req.body.date,
    username: req.body.username,
    registrationID: req.body.registrationID,
    agentcode: req.body.agentcode,
    phonenumber: req.body.phonenumber,
    execuitivecode: req.body.execuitivecode
  };
  const season = await Season.find({});
  const size = season.length;
  var date = req.body.date
  var search = [];
  search.push({ registrationID: { $regex: req.body.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: req.body.username}, seasonnumber: req.session.user.seasonnumber });
  if(req.body.phonenumber!=''){
    search.push({ $or: [{phonenumber1: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber },
      {phonenumber2: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber }
    ]});
  }
  if(req.body.agentcode!=''){
    search.push({ agentcode: { $regex: req.body.agentcode}, seasonnumber: req.session.user.seasonnumber });
  }
  if(req.body.execuitivecode!=''){
    search.push({ execuitivecode: { $regex: req.body.execuitivecode}, seasonnumber: req.session.user.seasonnumber });
  }
  const page = Number(req.body.page);
  var user = await SchemUser.find({$and: search}).sort({registrationID: 1});
  var result = []
  var pending = []
  var length = 0
  if(user!=null){
    length = user.length
  }
  for(let i=0;i<length;i=i+1){
    let unpaid = unpaidMoneyDate(user[i], date);
    if(unpaid!=0){
      result.push(user[i])
      pending.push(unpaid)
    }
  }
  const startIndex = (page-1)*pageSize;
  result = result.slice(startIndex, startIndex+pageSize);
  pending = pending.slice(startIndex, startIndex+pageSize);
  res.render("src/Tables/report", {username:req.session.user.username, role: req.session.user.role, user: result, seasonnumber: req.session.user.seasonnumber,
    message: "<div></div>", pending: pending, condition: condition, size: size, page: page});
});
app.post('/reportPrev', Authenticated, async (req, res) => {
  var condition = {
    date: req.body.date,
    username: req.body.username,
    registrationID: req.body.registrationID,
    agentcode: req.body.agentcode,
    phonenumber: req.body.phonenumber,
    execuitivecode: req.body.execuitivecode
  };
  const season = await Season.find({});
  const size = season.length;
  var date = req.body.date
  var search = [];
  search.push({ registrationID: { $regex: req.body.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: req.body.username}, seasonnumber: req.session.user.seasonnumber });
  if(req.body.phonenumber!=''){
    search.push({ $or: [{phonenumber1: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber },
      {phonenumber2: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber }
    ]});
  }
  if(req.body.agentcode!=''){
    search.push({ agentcode: { $regex: req.body.agentcode}, seasonnumber: req.session.user.seasonnumber });
  }
  if(req.body.execuitivecode!=''){
    search.push({ execuitivecode: { $regex: req.body.execuitivecode}, seasonnumber: req.session.user.seasonnumber });
  }
  const page = Number(req.body.page)-1;
  var user = await SchemUser.find({$and: search}).sort({registrationID: 1});
  var result = []
  var pending = []
  var length = 0
  if(user!=null){
    length = user.length
  }
  for(let i=0;i<length;i=i+1){
    let unpaid = unpaidMoneyDate(user[i], date);
    if(unpaid!=0){
      result.push(user[i])
      pending.push(unpaid)
    }
  }
  const startIndex = (page-1)*pageSize;
  result = result.slice(startIndex, startIndex+pageSize);
  pending = pending.slice(startIndex, startIndex+pageSize);
  res.render("src/Tables/report", {username:req.session.user.username, role: req.session.user.role, user: result, seasonnumber: req.session.user.seasonnumber,
    message: "<div></div>", pending: pending, condition: condition, size: size, page: page});
});
app.post('/reportNext', Authenticated, async (req, res) => {
  var condition = {
    date: req.body.date,
    username: req.body.username,
    registrationID: req.body.registrationID,
    agentcode: req.body.agentcode,
    phonenumber: req.body.phonenumber,
    execuitivecode: req.body.execuitivecode
  };
  const season = await Season.find({});
  const size = season.length;
  var date = req.body.date
  var search = [];
  search.push({ registrationID: { $regex: req.body.registrationID}, seasonnumber: req.session.user.seasonnumber });
  search.push({ username: { $regex: req.body.username}, seasonnumber: req.session.user.seasonnumber });
  if(req.body.phonenumber!=''){
    search.push({ $or: [{phonenumber1: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber },
      {phonenumber2: { $regex: req.body.phonenumber}, seasonnumber: req.session.user.seasonnumber }
    ]});
  }
  if(req.body.agentcode!=''){
    search.push({ agentcode: { $regex: req.body.agentcode}, seasonnumber: req.session.user.seasonnumber });
  }
  if(req.body.execuitivecode!=''){
    search.push({ execuitivecode: { $regex: req.body.execuitivecode}, seasonnumber: req.session.user.seasonnumber });
  }
  const page = Number(req.body.page)+1;
  var user = await SchemUser.find({$and: search}).sort({registrationID: 1});
  var result = []
  var pending = []
  var length = 0
  if(user!=null){
    length = user.length
  }
  for(let i=0;i<length;i=i+1){
    let unpaid = unpaidMoneyDate(user[i], date);
    if(unpaid!=0){
      result.push(user[i])
      pending.push(unpaid)
    }
  }
  const startIndex = (page-1)*pageSize;
  result = result.slice(startIndex, startIndex+pageSize);
  pending = pending.slice(startIndex, startIndex+pageSize);
  res.render("src/Tables/report", {username:req.session.user.username, role: req.session.user.role, user: result, seasonnumber: req.session.user.seasonnumber,
    message: "<div></div>", pending: pending, condition: condition, size: size, page: page});
});
// Display filtered the agent data
app.post('/agent', Authenticated, async (req, res) => {
  var agent = await Agent.find({$or: [
      { username: { $regex: req.body.condition} },
      { agentcode: { $regex: req.body.condition} },  
      { phonenumber: { $regex: req.body.condition} }
    ]}).sort({ agentcode: 1 });
    if(req.body.condition==''){
      agent = await Agent.find({});
    }
  res.render("src/Tables/agent", {username:req.session.user.username, role: req.session.user.role, agent: agent, message: "<div></div>"});
});
// Dislay filtered the executive data
app.post('/execuitive', Authenticated, async (req, res) => {
  var execuitive = await Execuitive.find({$or: [
      { username: { $regex: req.body.condition } },
      { execuitivecode: { $regex: req.body.condition} },  
      { phonenumber: { $regex: req.body.condition} }
    ]}).sort({ execuitivecode: 1 });
    if(req.body.condition==''){
      execuitive = await Execuitive.find({});
    }
  res.render("src/Tables/execuitive", {username:req.session.user.username, role: req.session.user.role, execuitive: execuitive, message: "<div></div>"});
});


//  Update the scheme user data
app.post('/updatedata', Authenticated, async (req, res) => {
  const user = await SchemUser.findOne({_id: req.body.update});
  res.render("src/Entered/updateEnteredMember", {username:req.session.user.username, role: req.session.user.role, user: user});
});
//  Update the agent data
app.post('/agentdata', Authenticated, async (req, res) => {
  const agent = await Agent.findOne({_id: req.body.update});
  res.render("src/Entered/updateEnteredAgent", {username:req.session.user.username, role: req.session.user.role, agent: agent});
});
//  Update the executive data
app.post('/execuitivedata', Authenticated, async (req, res) => {
  const execuitive = await Execuitive.findOne({_id: req.body.update});
  res.render("src/Entered/updateEnteredExecuitive", {username:req.session.user.username, role: req.session.user.role, execuitive: execuitive});
});
//  Update the transaction data from the pending amount table page
app.post('/transaction', Authenticated, async (req, res) => {
  const user = await SchemUser.findOne({_id: req.body.update});
  const season = await Season.findOne({seasonnumber: user.seasonnumber});
  const message = "<div></div>";
  res.render("src/Entered/transactionEnteredMember", {username:req.session.user.username, role: req.session.user.role, user: user, amount: season.amount, message: message});
});
//  Update the transaction data from the subscriber table page
app.post('/transactionSubscriber', Authenticated, async (req, res) => {
  const user = await SchemUser.findOne({_id: req.body.update});
  const season = await Season.findOne({seasonnumber: user.seasonnumber});
  const message = "<div></div>";
  res.render("src/Entered/transactionEnteredSubscriberMember", {username:req.session.user.username, role: req.session.user.role, user: user, amount: season.amount, message: message});
});
// Update the status of the user
app.post('/statusdata', Authenticated, async (req, res) => {
  const user = await SchemUser.findOne({_id: req.body.update});
  res.render("src/Entered/statusEnteredMember", {username:req.session.user.username, role: req.session.user.role, user: user});
});


// Add the member page
app.get('/addMember', Authenticated, (req, res) => {
  res.render("src/Forms/addMember", {username:req.session.user.username, role: req.session.user.role});
});
// Add the agent page
app.get('/addAgent', Authenticated, (req, res) => {
  res.render("src/Forms/addAgent", {username:req.session.user.username, role: req.session.user.role});
});
// Add the executive page
app.get('/addExecuitive', Authenticated, (req, res) => {
  res.render("src/Forms/addExecuitive", {username:req.session.user.username, role: req.session.user.role});
});


// Update transactions of the member
app.post('/transactionMember', Authenticated, async (req, res) => {
  for(let i=0;i<req.body.transactionArray.length;i++){
    if(req.body.paidArray[i]=='0'){
      if(!(req.body.transactionArray[i]=='' && req.body.paymentdateArray[i]=='')){
        const user = await SchemUser.findOne({_id: req.body.identifier});
        const season = await Season.findOne({seasonnumber: user.seasonnumber});
        const message = '<div class="alert alert-danger"><strong>Failure!</strong> Paid value zero.</div>';
        res.render("src/Entered/transactionEnteredMember", {username:req.session.user.username, role: req.session.user.role, user: user, amount: season.amount, message: message});
        return;
      }
    }
    else{
      if(req.body.transactionArray[i]=='' || req.body.paymentdateArray[i]==''){
        const user = await SchemUser.findOne({_id: req.body.identifier});
        const season = await Season.findOne({seasonnumber: user.seasonnumber});
        const message = '<div class="alert alert-danger"><strong>Failure!</strong> Unfilled payment date or transaction date.</div>';
        res.render("src/Entered/transactionEnteredMember", {username:req.session.user.username, role: req.session.user.role, user: user, amount: season.amount, message: message});
        return;
      }
    }
  }  
  const user = await SchemUser.findOne({_id: req.body.identifier});
  let array = []
  for(let i=0;i<req.body.transactionArray.length;i++){
    if(req.body.transactionArray[i]!=user.transactionArray[i]){
      array.push(req.body.transactionArray[i]);
    }
  }
  let valid = await uniqueTransactionID(array);
  if(valid){
    await insertTransactionID(array);
  }
  else{
    const user = await SchemUser.findOne({_id: req.body.identifier});
    const season = await Season.findOne({seasonnumber: user.seasonnumber});
    const message = '<div class="alert alert-danger"><strong>Failure!</strong> Repeated Transaction ID.</div>';
    res.render("src/Entered/transactionEnteredMember", {username:req.session.user.username, role: req.session.user.role, user: user, amount: season.amount, message: message});
    return;
  }
  var transactionArray = []
  var paymentdateArray = []
  var unpaidArray = []
  var paidArray = []
  for(let i=0;i<user.transactionArray.length;i=i+1){
    transactionArray.push(req.body.transactionArray[i]);
    paymentdateArray.push(req.body.paymentdateArray[i]);
    unpaidArray.push(Number(req.body.unpaidArray[i]));
    paidArray.push(Number(req.body.paidArray[i]));
  }
  update = {
    transactionArray: transactionArray,
    paymentdateArray: paymentdateArray,
    unpaidArray: unpaidArray,
    paidArray: paidArray,
  }
  await SchemUser.findOneAndUpdate({_id: req.body.identifier}, update, {new: true,upsert: true});
  res.redirect("/reportSuccess")
});
// Update the transactions of the member
app.post('/transactionSubscriberMember', Authenticated, async (req, res) => {
  for(let i=0;i<req.body.transactionArray.length;i++){
    if(req.body.paidArray[i]=='0'){
      if(!(req.body.transactionArray[i]=='' && req.body.paymentdateArray[i]=='')){
        const user = await SchemUser.findOne({_id: req.body.identifier});
        const season = await Season.findOne({seasonnumber: user.seasonnumber});
        const message = '<div class="alert alert-danger"><strong>Failure!</strong> Paid value zero.</div>';
        res.render("src/Entered/transactionEnteredSubscriberMember", {username:req.session.user.username, role: req.session.user.role, user: user, amount: season.amount, message: message});
        return;
      }
    }
    else{
      if(req.body.transactionArray[i]=='' || req.body.paymentdateArray[i]==''){
        const user = await SchemUser.findOne({_id: req.body.identifier});
        const season = await Season.findOne({seasonnumber: user.seasonnumber});
        const message = '<div class="alert alert-danger"><strong>Failure!</strong> Unfilled payment date or transaction date.</div>';
        res.render("src/Entered/transactionEnteredSubscriberMember", {username:req.session.user.username, role: req.session.user.role, user: user, amount: season.amount, message: message});
        return;
      }
    }
  }  
  const user = await SchemUser.findOne({_id: req.body.identifier});
  let array = []
  for(let i=0;i<req.body.transactionArray.length;i++){
    if(req.body.transactionArray[i]!=user.transactionArray[i]){
      array.push(req.body.transactionArray[i]);
    }
  }
  let valid = await uniqueTransactionID(array);
  if(valid){
    await insertTransactionID(array);
  }
  else{
    const user = await SchemUser.findOne({_id: req.body.identifier});
    const season = await Season.findOne({seasonnumber: user.seasonnumber});
    const message = '<div class="alert alert-danger"><strong>Failure!</strong> Repeated Transaction ID.</div>';
    res.render("src/Entered/transactionEnteredSubscriberMember", {username:req.session.user.username, role: req.session.user.role, user: user, amount: season.amount, message: message});
    return;
  }
  var transactionArray = []
  var paymentdateArray = []
  var unpaidArray = []
  var paidArray = []
  for(let i=0;i<user.transactionArray.length;i=i+1){
    transactionArray.push(req.body.transactionArray[i]);
    paymentdateArray.push(req.body.paymentdateArray[i]);
    unpaidArray.push(Number(req.body.unpaidArray[i]));
    paidArray.push(Number(req.body.paidArray[i]));
  }
  update = {
    transactionArray: transactionArray,
    paymentdateArray: paymentdateArray,
    unpaidArray: unpaidArray,
    paidArray: paidArray,
  }
  await SchemUser.findOneAndUpdate({_id: req.body.identifier}, update, {new: true,upsert: true});
  res.redirect("/viewSuccess")
});
// Update the member into collection
app.post('/updateMember', Authenticated, async (req, res) => {
  var temp = getTime();
  const date = String(temp[2]).padStart(2, '0')+"-"+String(temp[1]).padStart(2, '0')+"-"+String(temp[0]).padStart(2, '0');
  var agentcode = null
  var execuitivecode = null
  if(req.body.agentcode!=""){
    agentcode=req.body.agentcode
  }
  if(req.body.execuitivecode!=""){
    execuitivecode=req.body.execuitivecode
  }
  var update = {
    username: req.body.username,
    registrationID: req.body.registrationID,
    phonenumber1: req.body.phonenumber1,
    phonenumber2: req.body.phonenumber2,
    datelast: date,
    userlastID: req.session.user._id,
    agentcode: agentcode,
    execuitivecode: execuitivecode
  }
  await SchemUser.findOneAndUpdate({registrationID: req.body.registrationID}, update, {new: true,upsert: true});
  res.redirect("/viewSuccess");
});
// Update the agent into collection
app.post('/updateAgent', Authenticated, async (req, res) => {
  var update = {
      username: req.body.username,
      phonenumber: req.body.phonenumber
    }
  await Agent.findOneAndUpdate({agentcode: req.body.agentcode}, update, {new: true,upsert: true});
  res.redirect("/agentSuccess");
});
// Update the executive into collection
app.post('/updateExecuitive', Authenticated, async (req, res) => {
  var update = {
      username: req.body.username,
      phonenumber: req.body.phonenumber
    }
  await Execuitive.findOneAndUpdate({execuitivecode: req.body.execuitivecode}, update, {new: true,upsert: true});
  res.redirect("/execuitiveSuccess");
});


// Add the member into collection
app.post('/addMember', Authenticated, async (req, res) => {
  const user = await SchemUser.findOne({registrationID: req.body.registrationID});
  if(user!=null){
    res.redirect("/viewFailure");
  }
  else{
  var season = await Season.findOne({seasonnumber: req.session.user.seasonnumber});
  if(season==null){
    res.redirect("/viewFailure");
  }
  else{
  var transactionArray = [] 
  var lastdateArray = []
  var paymentdateArray = []
  var unpaidArray = []
  var paidArray = []
  for(let i=0;i<season.months;i=i+1){
    string = season.startdate.split("-")
    string = string[0]+"-"+String((Number(string[1])-1+i)%12+1)+"-"+String(Number(string[2])+Math.ceil((Number(string[1])+i)/12)-1)
    transactionArray.push(null)
    lastdateArray.push(string)
    paymentdateArray.push(null)
    unpaidArray.push(season.amount)
    paidArray.push(0)
  }
  var temp = getTime();
  const date = String(temp[2]).padStart(2, '0')+"-"+String(temp[1]).padStart(2, '0')+"-"+String(temp[0]).padStart(2, '0');
  var agentcode = null
  var execuitivecode = null
  if(req.body.agentcode!=""){
    agentcode=req.body.agentcode
  }
  if(req.body.execuitivecode!=""){
    execuitivecode=req.body.execuitivecode
  }
  var update = {
    username: req.body.username,
    registrationID: req.body.registrationID,
    phonenumber1: req.body.phonenumber1,
    phonenumber2: req.body.phonenumber2,
    transactionArray: transactionArray,
    lastdateArray: lastdateArray,
    paymentdateArray: paymentdateArray,
    unpaidArray: unpaidArray,
    paidArray: paidArray,
    status: 'ACTIVE',
    statusdate: null,
    datecreated: date,
    datelast: date,
    seasonnumber: req.session.user.seasonnumber,
    userlastID: req.session.user._id,
    agentcode: agentcode,
    execuitivecode: execuitivecode
  }
  await SchemUser.findOneAndUpdate({registrationID: req.body.registrationID}, update, {new: true,upsert: true});
  res.redirect("/viewSuccess");
  }
  }
});
// Add the agent into collection
app.post('/addAgent', Authenticated, async (req, res) => {
  const user = await Agent.findOne({agentcode: req.body.agentcode});
  if(user!=null){
    res.redirect("/agentFailure");
  }
  else{
    var update = {
        username: req.body.username,
        agentcode: req.body.agentcode,
        phonenumber: req.body.phonenumber
      }
    await Agent.insertMany([update]);
    res.redirect("/agentSuccess");
  }
});
// Add the executive into collection
app.post('/addExecuitive', Authenticated, async (req, res) => {
  const user = await Execuitive.findOne({execuitivecode: req.body.execuitivecode});
  if(user!=null){
    res.redirect("/execuitiveFailure");
  }
  else{
    var update = {
        username: req.body.username,
        execuitivecode: req.body.execuitivecode,
        phonenumber: req.body.phonenumber
      }
    await Execuitive.insertMany([update]);
    res.redirect("/execuitiveSuccess");
  }
});
// Update the member status into collection
app.post('/statusMember', Authenticated, async (req, res) => {
  const user = await SchemUser.findOne({ registrationID: req.body.registrationID });
  var update;
  const season = await Season.findOne({seasonnumber: user.seasonnumber});
  var temp = getTime();
  const date = String(temp[2]).padStart(2, '0')+"-"+String(temp[1]).padStart(2, '0')+"-"+String(temp[0]).padStart(2, '0');
  if(req.body.status=='ACTIVE'){
    var unpaidArray = [];
    for(let i=0;i<season.months;i=i+1){
      if(user.paidArray[i]==0){
        unpaidArray.push(season.amount);
      }
      else{
        unpaidArray.push(0);
      }
    }
    update = {status: req.body.status, unpaidArray: unpaidArray, statusdate: date};
  }
  else{
    var unpaidArray = [];
    for(let i=0;i<season.months;i=i+1){
      unpaidArray.push(0);
    }
    update = {status: req.body.status, unpaidArray: unpaidArray, statusdate: date};
  }
  await SchemUser.findOneAndUpdate({ registrationID: req.body.registrationID }, update, {new: true,upsert: true});
  res.redirect("/viewSuccess");
});


// All the following code is used for the signup and login processes
app.get("/login", function (req, res) {
    res.render("login");
});

app.get('/register', isAuthenticated, async (req, res) => {
  res.render("register");
});

// Login endpoint
app.post('/login', async (req, res) => {
  const username = req.body.username; 
  const password = req.body.password;
  const user = await User.findOne({ username: username});
  if (user) {
    // Store user information in session
    isValidPassword = await bcrypt.compare(password, user.password);
    if(isValidPassword){
      // Include the session information
      const season = await Season.find({});
      const temp = {
        username: user.username,
        password: user.password,
        role: user.role,
        seasonnumber: season.length,
        seasonlength: season.length
      };
      req.session.user = temp;
      res.redirect("/");
    }
    else{
      res.redirect("/login");
    }
  } else {
    res.redirect("/login")
  }
});

// Logout endpoint
app.get('/logout', Authenticated, (req, res) => {
  // Destroy the session
  req.session.destroy(err => {
    if (err) {
      console.log('Internal Server Error');
    }
    else{
      console.log('Logout successful');
    }
    res.redirect("/login")
  });
});

// Register endpoint
app.post('/register', isAuthenticated, async (req, res) => {
  const username = req.body.username
  const password = await bcrypt.hash(req.body.password, 12);
  const role = req.body.role;
  const user = await User.findOne({ username: username });
  if (user) {
    console.log('User already exists');
  }
  else{
    // Create a new user
    const newUser = new User({username, password, role});
    await newUser.save();
    console.log('User registered successfully');
  }
  res.redirect("/");
});

// Start the server
const port = 4000;
app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
