// spin up the node server
const cookieParser =require('cookie-parser');
require('dotenv').config({path:'variables.env'});
const jwt =require('jsonwebtoken');
const createYogaServer = require("./createYogaServer");
const db = require("./db");


const server = createYogaServer();
//use express middleware to handle cookies (JWT)
server.express.use(cookieParser());
// decode the JWT to  obtain userId on each request
server.express.use((req, res, next)=>{
    // pull token out of the request jwt
const { token }= req.cookies;
console.log(token);
if(token){
    const {userId}= jwt.verify(token, process.env.APP_SECRET);
    // PUT THE userId ON TO THE REQUEST FOR FURTHER precesses
    req.userId=userId; 
    console.log(userId);

}
        next();
});
// create a middleware that would populates the user on each request
 server.express.use( async (req, res, next) =>{
     if(!req.userId) return next();

     const user= await db.query.user(
         {where:{id: req.userId}},
        `{id, name, email, permissions}`);
req.user=user;
        next();
 });

// start the server
server.start({
    cors:{
        credentials:true,
        origin: process.env.FRONTEND_URL,
    },          
}, deets  =>{
console.log(`server is now running on port http:/localhost:${deets.port}`);
})

