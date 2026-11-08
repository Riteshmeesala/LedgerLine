package com.ledgerline.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AccountStatusChangeRequest(
        @NotBlank(message = "Reason is mandatory")
        @Size(min = 3, max = 200, message = "Reason must be between 3 and 200 characters")
        String reason
) {}

