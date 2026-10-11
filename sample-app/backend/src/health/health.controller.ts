import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@sample-app/shared";

@Controller("api/health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: "ok" };
  }
}
