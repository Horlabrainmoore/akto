package com.akto.util;

import com.mongodb.BasicDBObject;
import com.mongodb.client.model.Accumulators;
import com.mongodb.client.model.Aggregates;
import com.mongodb.client.model.Field;
import org.bson.conversions.Bson;

import java.util.Arrays;
import java.util.List;

public class GroupByTimeRange {
    public static void groupByAllRange(long daysBetween, List<Bson> pipeline, String timestampField, String groupByField) {
        if (daysBetween <= 30) {
            groupByDay(pipeline, timestampField, groupByField);
        } else if (daysBetween <= 210) {
            groupByWeek(pipeline, timestampField, groupByField);
        } else {
            groupByMonth(pipeline, timestampField, groupByField);
        }
    }

    public static void groupByDay(List<Bson> pipeline, String timestampField, String groupByField) {
        Bson addFieldsStage = Aggregates.addFields(
                new Field<>("day", new BasicDBObject("$dateToString",
                        new BasicDBObject("format", "%Y-%m-%d")
                                .append("date", new BasicDBObject("$toDate",
                                        new BasicDBObject("$multiply", Arrays.asList("$"+timestampField, 1000))))
                ))
        );
        Bson groupStage = Aggregates.group("$day", Accumulators.sum(groupByField, 1));
        Bson sortStage = Aggregates.sort(new BasicDBObject("_id", 1));
        pipeline.add(addFieldsStage);
        pipeline.add(groupStage);
        pipeline.add(sortStage);
    }

    public static void groupByWeek(List<Bson> pipeline, String timestampField, String groupByField) {
        Bson addFieldsStage = Aggregates.addFields(
                new Field<>("week", new BasicDBObject("$week", new BasicDBObject("$toDate",
                        new BasicDBObject("$multiply", Arrays.asList("$"+timestampField, 1000))))
                ));
        Bson groupStage = Aggregates.group("$week", Accumulators.sum(groupByField, 1));
        Bson sortStage = Aggregates.sort(new BasicDBObject("_id", 1));
        pipeline.add(addFieldsStage);
        pipeline.add(groupStage);
        pipeline.add(sortStage);
    }

    public static void groupByMonth(List<Bson> pipeline, String timestampField, String groupByField) {
        Bson addFieldsStage = Aggregates.addFields(
                new Field<>("month", new BasicDBObject("$month", new BasicDBObject("$toDate",
                        new BasicDBObject("$multiply", Arrays.asList("$"+timestampField, 1000))))
                ));
        Bson groupStage = Aggregates.group("$month", Accumulators.sum(groupByField, 1));
        Bson sortStage = Aggregates.sort(new BasicDBObject("_id", 1));
        pipeline.add(addFieldsStage);
        pipeline.add(groupStage);
        pipeline.add(sortStage);
    }
}
