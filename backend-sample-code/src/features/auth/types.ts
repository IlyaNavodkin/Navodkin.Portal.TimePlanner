export interface JwtPayload {
  sub: string;
  username: string;
  role: "member" | "admin";
  jti: string;
  iat?: number;
  exp?: number;
}

export interface RefreshJwtPayload {
  sub: string;
  jti: string;
  typ: "refresh";
  iat?: number;
  exp?: number;
}
