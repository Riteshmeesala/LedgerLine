package com.ledgerline.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

public final class CanonicalJsonUtil {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CanonicalJsonUtil() {}

    /**
     * Converts any payload to a canonical, deterministically sorted JSON string.
     * All object keys are sorted in lexicographical order. Whitespace is strictly eliminated.
     */
    public static String canonicalize(Object obj) {
        if (obj == null) {
            return "{}";
        }
        try {
            JsonNode node;
            if (obj instanceof JsonNode jn) {
                node = jn;
            } else if (obj instanceof String s) {
                String trimmed = s.trim();
                if (trimmed.isEmpty()) {
                    return "{}";
                }
                node = MAPPER.readTree(trimmed);
            } else {
                node = MAPPER.valueToTree(obj);
            }
            JsonNode canonical = sortJsonNode(node);
            return MAPPER.writeValueAsString(canonical);
        } catch (Exception e) {
            return "{}";
        }
    }

    private static JsonNode sortJsonNode(JsonNode node) {
        if (node == null || node.isNull()) {
            return JsonNodeFactory.instance.nullNode();
        }
        if (node.isObject()) {
            ObjectNode objNode = (ObjectNode) node;
            Iterator<String> fieldNames = objNode.fieldNames();
            List<String> sortedNames = new ArrayList<>();
            fieldNames.forEachRemaining(sortedNames::add);
            Collections.sort(sortedNames);

            ObjectNode sortedNode = JsonNodeFactory.instance.objectNode();
            for (String name : sortedNames) {
                sortedNode.set(name, sortJsonNode(objNode.get(name)));
            }
            return sortedNode;
        } else if (node.isArray()) {
            ArrayNode arrNode = (ArrayNode) node;
            ArrayNode sortedArr = JsonNodeFactory.instance.arrayNode();
            for (JsonNode item : arrNode) {
                sortedArr.add(sortJsonNode(item));
            }
            return sortedArr;
        }
        return node;
    }
}

