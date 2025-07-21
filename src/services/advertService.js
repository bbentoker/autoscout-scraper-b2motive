/**
 * Advert Service
 * Handles advert-related operations
 */

const { Advert, SeenInfo } = require('../../models');

async function prepareForNotExistingAdvertCheck(controlID) {
    console.log('📋 Preparing SeenInfo records for existing adverts...');
    
    const adverts = await Advert.findAll({ where: { is_active: true } });
    const advertIds = adverts.map((advert) => advert.autoscout_id);

    console.log(`📝 Creating SeenInfo records for ${advertIds.length} active adverts`);

    await Promise.all(
        advertIds.map((advertId) =>
            SeenInfo.create({
                control_id: controlID,
                advert_id: advertId,
                seen: false,
            })
        )
    );
    
    console.log('✅ Finished creating SeenInfo records');
}

async function markUnseenAdvertsAsInactive(control) {
    console.log('🔄 Marking unseen adverts as inactive...');
    
    const advertsToUpdate = await SeenInfo.findAll({
        where: { control_id: control.id, seen: false },
    });

    console.log(`📝 Found ${advertsToUpdate.length} adverts to mark as inactive`);

    for (const seenInfo of advertsToUpdate) {
        const advert = await Advert.findOne({
            where: { autoscout_id: seenInfo.advert_id },
        });
        
        if (advert) {
            advert.is_active = false;
            advert.last_seen = control.date;
            await advert.save();
            console.log(`🔄 Advert ID ${seenInfo.advert_id} marked as inactive.`);
        }
    }
    
    console.log('✅ Finished marking unseen adverts as inactive');
}

module.exports = {
    prepareForNotExistingAdvertCheck,
    markUnseenAdvertsAsInactive
}; 