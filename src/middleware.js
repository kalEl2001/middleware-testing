import { kv } from "@vercel/kv";
import { NextURL } from "next/dist/server/web/next-url";
import { NextResponse } from "next/server";

const COOKIE_NAME_ID = "__waiting_room_id";
const COOKIE_NAME_TIME = "__waiting_room_last_update_time";
const NUMBER_OF_USERS_IN_ROOM = 2;

const makeid = (length) => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

const createNewUserId = async (res) => {
  while (true) {
    const newId = makeid(8);
    const user = await kv.get(newId);
    if (!user) {
      // create new user and set ttl to be 2 minutes
      await kv.set(
        newId,
        {
          id: newId,
          email: null,
          entryTime: Date.now(),
          lastUpdateTime: Date.now(),
          status: "waiting",
        },
        {
          ttl: 60 * 2,
        }
      );
      return newId;
    }
  }
};

export default async function middleware(req, ev) {
  const res = new NextResponse();
  let user = req.cookies.get(COOKIE_NAME_ID)?.value;

  if (!user) {
    user = await createNewUserId(req);
    res.cookies.set(COOKIE_NAME_ID, user, {
      maxAge: 60 * 60 * 24 * 365,
    });
    res.cookies.set(COOKIE_NAME_TIME, Date.now(), {
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    // update user last update time
    const userData = await kv.get(user);
    if (userData) {
      userData.lastUpdateTime = Date.now();
      await kv.set(userData.id, userData, {
        ttl: 60 * 2,
      });
      res.cookies.set(COOKIE_NAME_TIME, Date.now(), {
        maxAge: 60 * 60 * 24 * 365,
      });
    } else {
      user = await createNewUserId(res);
      res.cookies.set(COOKIE_NAME_ID, user, {
        maxAge: 60 * 60 * 24 * 365,
      });
      res.cookies.set(COOKIE_NAME_TIME, Date.now(), {
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  // update all user status
  const users = [];
  const it = kv.scan({ prefix: "" });
  while (it.key !== undefined) {
    const user = await it.next();
    users.push(user);
  }
  // sort by entry time
  users.sort((a, b) => {
    return a.entryTime - b.entryTime;
  });
  // update status
  let totalInRoomUsers = 0;

  for (const user of users) {
    if (user.status === "in_room") {
      totalInRoomUsers++;
    } else if (
      user.status === "waiting" &&
      totalInRoomUsers < NUMBER_OF_USERS_IN_ROOM
    ) {
      user.status = "in_room";
      await kv.hset(user.id, user);
    }
  }

  // get latest self user
  const selfUser = await kv.get(user);
  //   check if self user is in room
  if (selfUser.status === "in_room") {
    // redirect to base url + /room
    return res.url(new NextURL("/room", req.url));
  } else {
    return res.url(new NextURL("/waiting", req.url));
  }
}
