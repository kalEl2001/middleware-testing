import { kv } from '@vercel/kv';
 
export default async function handler(request, response) {
  // get new name from request path parameter
  const { newEmail } = request.query;

  // get user from KV
  const oldUser = await kv.hgetall('me');

  // update KV
  await kv.hset('me', {
    id: oldUser.id,
    email: newEmail,
  });

  // get updated user from KV
  const newUser = await kv.hgetall('me');

  const user = {
    id: newUser.id,
    oldEmail: oldUser.email,
    newEmail: newUser.email,
  };

  return response.status(200).json(user);
}