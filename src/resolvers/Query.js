const {forwardTo} = require('prisma-binding');
const {hasPermission} = require('../utils');
// const {LoggedIn} = require('../oggedIn');

const Query = {
    // async items(parent, args, ctx, info) {
    //     const items = await ctx
    //         .db
    //         .query
    //         .items();
    //     return items;
    // },
    async users(parent, args, ctx, info) {
//1. check to see if the user is logged in
        if(!ctx.request.userId){

            throw Error ('You must be logged in to do that!!');

        }
        //2. CHECK IF THE USER HAS  the neccessary permissions
        hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE']);


        //3. query all users
        const users = await ctx
            .db
            .query
            .users({},info);
        return users;
    },


    async item(parent, {id}, ctx, info) {
        const where = {id };
        const item = await ctx
            .db
            .query
            .item({id},info);
        return item;
    },

    async user(parent, {email,id}, ctx, info) {
        const where = {id };
        const user = await ctx
            .db
            .query
            .user({ id }, info);
        return user;
    },

    // item: forwardTo('db'),
    items: forwardTo('db'),
    itemsConnection: forwardTo('db'),

    me(parent, args, ctx, info) {
        // check if there is a current userID
        if (!ctx.request.userId) {
            // throw Error('No user Found!!!');
            return null;
        }
        return ctx
            .db
            .query
            .user({
                where: { id: ctx.request.userId },
            }, info);
    }
};
module.exports = Query;
