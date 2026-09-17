interface User {
  id: string;
  name: string;
  email: string;
}

const mockUsers: User[] = [
  { id: '1', name: 'Alice Smith', email: 'alice@example.com' },
  { id: '2', name: 'Bob Jones', email: 'bob@example.com' },
];

export async function GET() {
  return Response.json({
    users: mockUsers,
    count: mockUsers.length,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const newUser: User = {
    id: String(mockUsers.length + 1),
    name: body.name || 'Anonymous User',
    email: body.email || 'anonymous@example.com',
  };
  mockUsers.push(newUser);

  return Response.json(
    {
      message: 'User created successfully',
      user: newUser,
    },
    { status: 201 }
  );
}
