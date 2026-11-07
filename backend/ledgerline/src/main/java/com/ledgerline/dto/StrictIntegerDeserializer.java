package com.ledgerline.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;

import java.io.IOException;

public class StrictIntegerDeserializer extends JsonDeserializer<Long> {

    @Override
    public Long deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        if (p.currentToken() != JsonToken.VALUE_NUMBER_INT) {
            throw new IllegalArgumentException("amountMinor must be a JSON integer (no strings, floats, or decimals permitted)");
        }
        return p.getLongValue();
    }
}

