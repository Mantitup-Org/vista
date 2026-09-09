import { cookies, headers } from 'vista/server';

// Example of a fully-featured API route in Vista.js
// Supports standard Request and Response objects, plus Vista server helpers.

// In-memory store for demonstration purposes
let users = [
  { id: 1, name: "Alice", role: "admin" },
  { id: 2, name: "Bob", role: "user" }
];

export async function GET(request: Request) {
  // Access headers using Vista's helper
  const headersList = headers();
  const authorization = headersList.get('authorization');
  
  // Access cookies using Vista's helper
  const cookieStore = cookies();
  const sessionId = cookieStore.get('session_id');

  // Access the URL and query parameters
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');

  let filteredUsers = users;
  if (role) {
    filteredUsers = users.filter(user => user.role === role);
  }

  // Return a standard Response with JSON
  return Response.json(
    { 
      success: true, 
      data: filteredUsers,
      meta: { authorized: !!authorization, hasSession: !!sessionId }
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  try {
    // Read and parse the incoming JSON body
    const body = await request.json();

    if (!body.name || !body.role) {
      return Response.json(
        { success: false, error: "Missing required fields: 'name' and 'role'" },
        { status: 400 }
      );
    }

    const newUser = {
      id: users.length + 1,
      name: body.name,
      role: body.role
    };

    users.push(newUser);

    return Response.json(
      { success: true, data: newUser, message: "User created successfully" },
      { status: 201, headers: { 'Location': `/api/users?id=${newUser.id}` } }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id') || '', 10);
    
    if (isNaN(id)) {
      return Response.json({ success: false, error: "Missing or invalid 'id' query parameter" }, { status: 400 });
    }

    const body = await request.json();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return Response.json({ success: false, error: "User not found" }, { status: 404 });
    }

    users[userIndex] = { ...users[userIndex], ...body, id };

    return Response.json({ success: true, data: users[userIndex], message: "User updated successfully" });
  } catch (error) {
    return Response.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get('id') || '', 10);
  
  if (isNaN(id)) {
    return Response.json({ success: false, error: "Missing or invalid 'id' query parameter" }, { status: 400 });
  }

  const initialLength = users.length;
  users = users.filter(u => u.id !== id);

  if (users.length === initialLength) {
    return Response.json({ success: false, error: "User not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
