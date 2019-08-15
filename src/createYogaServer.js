const {GraphQLServer} = require("graphql-yoga");
const Query =require("./resolvers/Query");
const Mutation =require("./resolvers/Mutation");
const db = require("./db");


//create the GraphQL Yoga Server
// spin  up a new graphql server
function createYogaServer(){
return new GraphQLServer({
    typeDefs:'src/schema.graphql',
    resolvers:{
        Mutation,
        Query
    },
    resolverValidationOptions:{
        requireResolversForResolveType:false
    },
    // always go to the database on every single request
    context: req =>({...req, db}),

});
}
module.exports=createYogaServer;