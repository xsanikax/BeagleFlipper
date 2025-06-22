package com.beagleflipper.ui.graph;


@FunctionalInterface
public interface CoordinateConverter {
    int toValue(int coordinate);
}