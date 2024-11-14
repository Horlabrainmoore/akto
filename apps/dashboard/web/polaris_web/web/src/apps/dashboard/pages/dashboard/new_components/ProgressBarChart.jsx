import { Badge, DataTable, HorizontalStack, Text } from '@shopify/polaris';
import React from 'react';
import CustomProgressBar from './CustomProgressBar';

function ProgressBarChart({ data }) {
    const generateRows = (data) => {
        return data.map((item) => [
            <HorizontalStack gap={2} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ maxWidth: '24px', display: 'flex', alignItems: 'center'}} className='custom-badge-color'>
                    <Badge size="small" tone={item["badgeColor"]} >{item.badgeValue}</Badge>
                </div>
                <div style={{ flexGrow: 1 }}>
                    <CustomProgressBar
                        progress={parseInt(item.progressValue)}
                        topColor={item["topColor"]}
                        backgroundColor={item["backgroundColor"]}
                    />
                </div>
                <Text>{item.text}</Text>
            </HorizontalStack>,
        ]);
    };


    const rows = generateRows(data)

    return (
        <DataTable
            columnContentTypes={[
                'text',
            ]}
            headings={[]}
            rows={rows}
            hoverable={false}
            increasedTableDensity
        />
    );
}

export default ProgressBarChart;
