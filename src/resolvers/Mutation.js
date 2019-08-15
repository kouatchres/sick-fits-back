const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {randomBytes} = require('crypto');
const {promisify} = require('util');
const {transport, makeANiceEmail} = require('../mail');
const {hasPermission} = require('../utils');
const stripe = require('../stripe');

const Mutations = {
    async createItem(parent, args, ctx, info) {
        const getUserID = ctx.request.userId;
        // TODO: Check if they are logged in
        if (!getUserID) {
            throw Error('You must be logged in to do that!!');
        }
        const item = await ctx
            .db
            .mutation
            .createItem({
                data: {
                    // user foreign key in the iten table
                    user: {
                        connect: {
                            id: getUserID
                        }
                    },
                    // rest of the other fields in item
                    ...args
                }
            }, info);
        console.log(item);

        return item;
    },
    updateItem(parent, args, ctx, info) {
        // first take a copy of the updates
        const updates = {
            ...args
        };
        // remove the ID from the updates
        delete updates.id;
        // run the update method
        return ctx
            .db
            .mutation
            .updateItem({
                data: updates,
                where: {
                    id: args.id
                }
            }, info);
    },
    async deleteItem(parent, args, ctx, info) {
const where = {
            id: args.id
        };
        // 1. find the item
        const item = await ctx
            .db
            .query
            .item({
                where
            }, `{id title user {id}}`);
        // 2. Check if they own that item, or have the permissions
         const ownsItem = item.user.id ===ctx.request.userId;
         const gotItemPermissions= ctx.request.user.permissions.some(
             permission=> ['ADMIN','ITEMDELETE'].includes(permission)
         );
if(!ownsItem && !gotItemPermissions ) {
    throw new Error('You do not have thee neccessary permissions for this action!')
}

        // 3. Delete it!
        return ctx
            .db
            .mutation
            .deleteItem({
                where
            }, info);

    },

    async signup(parent, args, ctx, info) {
        // lowercase their email
        args.email = args
            .email
            .toLowerCase();
        // hash their password
        const password = await bcrypt.hash(args.password, 10);
        // create the user in the database
        const user = await ctx
            .db
            .mutation
            .createUser({
                data: {
                    ...args,
                    password,
                    permissions: {
                        set: ['USER', 'ADMIN']
                    }
                }
            }, info);
        // create the JWT token for them
        const token = jwt.sign({
            userId: user.id
        }, process.env.APP_SECRET);
        // We set the jwt as a cookie on the response
        ctx
            .response
            .cookie('token', token, {
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
            });
        // Finalllllly we return the user to the browser
        return user;
    },
    async signin(parent, {
        email,
        password
    }, ctx, info) {
        // 1. check if there is a user with that email
        const user = await ctx
            .db
            .query
            .user({where: {
                    email
                }});
        if (!user) {
            throw new Error(`No such user found for email ${email}`);
        }
        // 2. Check if their password is correct
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            throw new Error('Invalid Password!');
        }
        // 3. generate the JWT Token
        const token = jwt.sign({
            userId: user.id
        }, process.env.APP_SECRET);
        // 4. Set the cookie with the token
        ctx
            .response
            .cookie('token', token, {
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 * 365
            });
        // 5. Return the user
        return user;
    },

    signout(parent, args, ctx, info) {
        ctx
            .response
            .clearCookie('token');
        return {message: 'Good Bye'};
    },
    async requestReset(parent, {
        email
    }, ctx, info) {
        // 1. check if there is a real user
        const user = await ctx
            .db
            .query
            .user({
                where: {
                    email: email
                }
            });
        if (!user) {
            throw new Error(`No such user found for email ${email}`);
        }
        // 2. generate a reset token for the reset password process
        const randomBytesPromisified = promisify(randomBytes);
        const resetToken = (await randomBytesPromisified(20)).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000 // one hour from now
        // save these variables to the user
        const res = await ctx
            .db
            .mutation
            .updateUser({
                where: {
                    email
                },
                data: {
                    resetToken,
                    resetTokenExpiry
                }
            });

        // 3. email them the resettoken
        const mailRes = await transport.sendMail({
            from: 'kouatch.com',
            to: user.email,
            subject: 'Your Password reset token',
            html: makeANiceEmail(`Your Password Reset Token is here!
\n\n
 <a href="${process.env.FRONTEND_URL}/resetPage?resetToken=${resetToken}">
 Reset your Password here
</a>`)
        });
        //4. return the message
        return {message: 'Thanks for this Point.'};
    },
    async resetPassword(parent, args, ctx, info) {
        // 1. check if the passwords match
        if (args.password !== args.confirmPassword) {
            throw new Error('Your passwords do not match');
        }
        //2. check if it is a legit reset token 3.check if it is expired
        const [user] = await ctx
            .db
            .query
            .users({
                where: {
                    resetToken: args.resetToken,
                    resetTokenExpiry_gte: Date.now() - 3600000
                }
            });
        if (!user) {
            throw new Error('This token is either expired or invalid');

        }
        //4. hash their new password
        const hashPassword = await bcrypt.hash(args.password, 10);
        //5. store the new password of the user and remove old reset token
        const updatedUser = await ctx
            .db
            .mutation
            .updateUser({
                where: {
                    email: user.email
                },
                // data to be updated
                data: {
                    password: hashPassword,
                    resetToken: null,
                    resetTokenExpiry: null
                }
            })
        // 6. generate the jwt for the user
        const token = jwt.sign({
            userId: updatedUser.id
        }, process.env.APP_SECRET);
        // 7. set the jwt cookie
        ctx
            .response
            .cookie('token', token, {
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
            });
        // 8.return the new user
        return updatedUser;
    },
    async updatePermissions(parent, args, ctx, info) {
        //1. check if they are logged in
        if (!ctx.request.userId) {
            throw new Error('You must be logged in');
        }
        //2. query the current user
        const currentUser =await ctx
            .db
            .query
            .user({where:{id: ctx.request.userId,},}, info);
        //3. check if they have the neccessary permissions
        hasPermission(currentUser, ['ADMIN','PERMISSIONUPDATE']);
        //4. udate the permissions
        return ctx.db.mutation.updateUser({
            data:{
                // set permissions to the updated ones
            permissions: {
                set: args.permissions
            },
        },
            where:{
                id: args.userId,
            },
        },info);
        
    },
    async addToCart(parent,args, ctx,info){
        //1. make sure the user i signed in
        const {userId} = ctx.request;
        if(!userId){
            throw new Error('you must be logged in!!');
        }
        // 2. query the user's current cartconst
        const [existingCartItem]= await ctx.db.query.cartItems({
            where:{
                user: {id: userId},
                item: {id: args.id}
            },
        }, info);

        //3. if  item found in user's cart increment by 1 
        if(existingCartItem) {
            console.log('this item is already in their cart');
      return  ctx.db.mutation.updateCartItem({
            where:{id: existingCartItem.id},
            data:{
                quantity: (existingCartItem.quantity) + 1
            }
        },info)
        }
        //4. if the item is not in the cart then include item in the user's cart
  return ctx.db.mutation.createCartItem({
data:{
   user:{
connect:{id: userId},
   },
   item:{
connect:{id: args.id},
   }
}  
},info);
    },

  async   removeCartItem(parent, args, ctx, info){
//   1. find the cart item
  const cartItemToDel = await ctx.db.query.cartItem({
      where:{
          id: args.id,
      },
  }, `{id, user {id}}`);
// 1.5 make sure an item was found
if(!cartItemToDel) {
    
    throw new Error('The item was not found!');
}
// 2. make sure they own the cart
if(cartItemToDel.user.id !== ctx.request.userId){

    throw new Error('You are not the owner of this item');
}
// 3. delete the cart item
 return ctx.db.mutation.deleteCartItem({where:{id: args.id}}, info);
    },

async createOrders(parent, args, ctx, info){
    // 1.query current user and make sure they are signed in
  const {userId} = ctx.request;
  if (!userId)  throw Error('You must be signed in to continue.');
  const user = await ctx.db.query.user({
      where: {id: userId},
  },`
  {
  id
  name
  email
  cart {
      id
      quantity
      item {
          id
          title
          price
          description
          image
          largeImage
                }
  }
}
  `);
    // 2.recalculate the total for the price
    const amount = user.cart.reduce((tally, cartItem)=> 
    (tally + cartItem.item.price )* cartItem.quantity, 0);
     console.log(`charging for a total of ${amount}`);
    // 3.create the stripe charge .. turn the token into money
const charge = await stripe.charges.create({
amount,
currency: 'USD',
source: args.token,
});

    // 4.conver cart items to order items
    const orderItems = user.cart.map(cartItem=> {
    const orderItem =  {
        // copies the rest of the cartItems variables from cart item
        ...cartItem.item,
        //includes the variable from the cart
        quantity: cartItem.quantity,
        user:{connect: {id: userId}},
    };
  delete orderItem.id;
  return orderItem;
    });
        // 5.create the order
        const order = await ctx.db.mutation.createOrders({
 data:{
   total: charge.amount,
   charge: charge.id,
   items: {create: orderItems},
   user:{connect: {id: userId}},
    },
        });
    // 6. clear the cart items from the cart
    const cartItemIds =user.cart.map(cartItem=> cartItem.id);
    await ctx.db.mutation.deleteManyCartItems({ 
        where:{
            id_in: cartItemIds,
        },
     });
    // 7. return the order to the client
    return order;

},

};

module.exports = Mutations;
 